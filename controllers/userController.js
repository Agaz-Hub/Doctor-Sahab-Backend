import validator from "validator";
import bcrypt from "bcrypt";
import userModel from "../models/userModel.js";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import doctorModel from "../models/doctorModel.js";
import appointmentModel from "../models/appointmentModel.js";
import { getSeverityAndTimeBlock } from "../ai/severityScorer.js";
import {
  calculateQueueSlot,
  isPastDate,
  normalizeDoctorShifts,
  parseHHMMToMinutes,
} from "../utils/shiftScheduler.js";
import { getSchedulerTriage } from "../utils/medicalSchedulerClient.js";

const pickQueuePositionForTime = (appointments, slotTime) => {
  const targetMins = parseHHMMToMinutes(slotTime);
  if (targetMins === null) return (appointments || []).length + 1;

  const sorted = [...(appointments || [])].sort((a, b) => {
    const aMins = parseHHMMToMinutes(a.slotTime) ?? Number.MAX_SAFE_INTEGER;
    const bMins = parseHHMMToMinutes(b.slotTime) ?? Number.MAX_SAFE_INTEGER;
    return aMins - bMins;
  });

  const index = sorted.findIndex((item) => {
    const mins = parseHHMMToMinutes(item.slotTime);
    return mins !== null && targetMins < mins;
  });

  return index === -1 ? sorted.length + 1 : index + 1;
};

const canFitPreferredTime = ({
  shift,
  existingAppointments,
  slotTime,
  durationMinutes,
}) => {
  const startMinutes = parseHHMMToMinutes(shift.startTime);
  const endMinutes = parseHHMMToMinutes(shift.endTime);
  const slotMinutes = parseHHMMToMinutes(slotTime);

  if (startMinutes === null || endMinutes === null || slotMinutes === null) {
    return false;
  }

  const duration = Number(durationMinutes) > 0 ? Number(durationMinutes) : 20;
  if (slotMinutes < startMinutes || slotMinutes + duration > endMinutes) {
    return false;
  }

  return !(existingAppointments || []).some((appointment) => {
    const existingStart = parseHHMMToMinutes(appointment.slotTime);
    if (existingStart === null) return false;
    const existingDuration = Number(appointment.durationMinutes) || 20;
    const existingEnd = existingStart + existingDuration;
    const targetEnd = slotMinutes + duration;
    return slotMinutes < existingEnd && targetEnd > existingStart;
  });
};

const parseSlotDateValue = (slotDate) => {
  if (!slotDate || typeof slotDate !== "string") return null;
  const trimmed = slotDate.trim();

  if (/^\d{1,2}_\d{1,2}_\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split("_").map(Number);
    return new Date(year, month - 1, day);
  }

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  if (
    /^\d{1,2}-\d{1,2}-\d{4}$/.test(trimmed) ||
    /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)
  ) {
    const [day, month, year] = trimmed.split(/[-/]/).map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const parseSlotTimeValue = (slotTime) => {
  if (!slotTime || typeof slotTime !== "string") {
    return { hours: 0, minutes: 0 };
  }

  const trimmed = slotTime.trim();
  const amPmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (amPmMatch) {
    let hours = Number(amPmMatch[1]);
    const minutes = Number(amPmMatch[2]);
    const meridiem = amPmMatch[3].toUpperCase();
    if (meridiem === "PM" && hours !== 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;
    return { hours, minutes };
  }

  const hhmmMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmmMatch) {
    return { hours: Number(hhmmMatch[1]), minutes: Number(hhmmMatch[2]) };
  }

  return { hours: 0, minutes: 0 };
};

const parseAppointmentDateTime = (slotDate, slotTime) => {
  const baseDate = parseSlotDateValue(slotDate);
  if (!baseDate) return null;
  const { hours, minutes } = parseSlotTimeValue(slotTime);

  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hours,
    minutes,
    0,
    0,
  );
};

const getDurationMinutes = (appointment) => {
  const parsed = Number(appointment?.durationMinutes);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
};

const getAppointmentWindow = (appointment) => {
  const start = parseAppointmentDateTime(
    appointment?.slotDate,
    appointment?.slotTime,
  );
  if (!start) return { start: null, end: null };
  const end = new Date(
    start.getTime() + getDurationMinutes(appointment) * 60000,
  );
  return { start, end };
};

const cancelMissedAppointmentsForUser = async (userId) => {
  const now = new Date();
  const appointments = await appointmentModel.find({
    userId,
    cancelled: false,
    iscompleted: false,
  });

  const idsToCancel = [];
  appointments.forEach((item) => {
    const { end } = getAppointmentWindow(item);
    if (!end) return;
    if (now > end) {
      idsToCancel.push(item._id);
    }
  });

  if (idsToCancel.length > 0) {
    await appointmentModel.updateMany(
      { _id: { $in: idsToCancel } },
      { $set: { cancelled: true } },
    );
  }
};

// API to register user
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "Please provide name, email and password" });
    }

    //validating password length
    if (password.length < 8) {
      return res.status(400).json({
        success: fail,
        message: "Password must be at least 6 characters long",
      });
    }

    //validating email format
    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: "Please provide a valid email" });
    }

    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User already exists with this email" });
    }

    //hashing user password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new userModel({ name, email, password: hashedPassword });
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.json({ success: true, token });
  } catch (error) {
    res.status(500).json({ message: "Error registering user", error });
  }
};

// API to login user
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Please provide email and password" });
    }

    const user = await userModel.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.json({ success: true, token });
  } catch (error) {
    res.status(500).json({ message: "Error logging in user", error });
  }
};

//API to get Profile of logged in user
const getProfile = async (req, res) => {
  try {
    const userId = req.userId; // Assuming user ID is set in req.body by auth middleware
    const user = await userModel.findById(userId).select("-password"); // Exclude password from the response
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: "Error fetching user profile", error });
  }
};

//API to update Profile of logged in user
const updateProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const { name, phone, address, dob, gender, imageUrl } = req.body;
    const imageFile = req.file;

    if (
      !name &&
      !phone &&
      !address &&
      !dob &&
      !gender &&
      !imageFile &&
      !imageUrl
    ) {
      return res
        .status(400)
        .json({ message: "Please provide at least one field to update" });
    }

    await userModel.findByIdAndUpdate(userId, {
      name,
      phone,
      address: JSON.parse(address || "{}"),
      dob,
      gender,
    });

    if (imageFile) {
      // Upload using buffer from memory storage
      const base64Image = `data:${imageFile.mimetype};base64,${imageFile.buffer.toString("base64")}`;
      const uploadResponse = await cloudinary.uploader.upload(base64Image, {
        resource_type: "image",
      });
      await userModel.findByIdAndUpdate(userId, {
        image: uploadResponse.secure_url,
      });
    } else if (imageUrl && typeof imageUrl === "string") {
      await userModel.findByIdAndUpdate(userId, {
        image: imageUrl.trim(),
      });
    }

    res.json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error updating user profile", error });
  }
};

// API to book appointment
const bookAppointment = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      docId,
      slotDate,
      shiftId,
      patientName,
      patientAge,
      symptoms,
      medicalHistory,
      symptomDurationDays,
      painScale,
      additionalNotes,
    } = req.body;

    if (
      !docId ||
      !slotDate ||
      !shiftId ||
      !patientName ||
      !patientAge ||
      !symptoms
    ) {
      return res
        .status(400)
        .json({ message: "Please provide all required fields" });
    }

    const docData = await doctorModel.findById(docId).select("-password");
    const userData = await userModel.findById(userId).select("-password");

    if (!docData) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    if (!userData) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!docData.available) {
      return res
        .status(400)
        .json({ message: "Doctor is not available for appointment" });
    }

    if (isPastDate(slotDate)) {
      return res.status(400).json({
        success: false,
        message: "Cannot book appointment for a past date.",
      });
    }

    const normalizedShifts = normalizeDoctorShifts(docData.shifts);
    const selectedShift = normalizedShifts.find(
      (shift) => shift.id === shiftId,
    );

    if (!selectedShift) {
      return res.status(400).json({
        success: false,
        message: "Invalid shift selected",
      });
    }

    let triage = null;
    let triageSource = "fallback";
    let schedulerError = null;

    try {
      triage = await getSchedulerTriage({
        patientName,
        patientAge,
        symptoms,
        medicalHistory,
        symptomDurationDays,
        painScale,
        additionalNotes,
      });
      triageSource = "medical_scheduler";
    } catch (error) {
      schedulerError = error?.message || "Medical scheduler unavailable";
      const fallback = getSeverityAndTimeBlock({ symptoms });
      triage = {
        severityScore: fallback.severityScore,
        durationMinutes: fallback.durationMinutes,
        urgencyTag: fallback.severityScore >= 75 ? "URGENT" : "ROUTINE",
        emergencyDetected: fallback.severityScore >= 90,
        estimatedWaitMinutes: 0,
        maxWaitHours: 0,
        recommendedSpecialty: "",
        matchedSymptoms: [],
        redFlags: [],
        scoreBreakdown: {},
        schedulerPatientId: "",
        schedulerMessage: "",
      };
    }

    const existingAppointments = await appointmentModel
      .find({
        docId,
        slotDate,
        shiftId,
        cancelled: false,
      })
      .select("slotTime durationMinutes queuePosition")
      .sort({ queuePosition: 1, date: 1 });

    const queueSlot = calculateQueueSlot({
      shift: selectedShift,
      existingAppointments,
      durationMinutes: triage.durationMinutes,
      slotDate,
    });

    if (!queueSlot.success || queueSlot.isFull) {
      return res.status(400).json({
        success: false,
        message: "Selected shift is full. Please choose another shift.",
      });
    }

    const docDataObj = docData.toObject();
    delete docDataObj.slots_booked;

    let finalSlotTime = queueSlot.slotTime;
    let finalSlotEndTime = queueSlot.slotEndTime;
    let finalQueuePosition = queueSlot.queuePosition;

    if (
      triageSource === "medical_scheduler" &&
      triage.estimatedSlotTime &&
      canFitPreferredTime({
        shift: selectedShift,
        existingAppointments,
        slotTime: triage.estimatedSlotTime,
        durationMinutes: triage.durationMinutes,
      })
    ) {
      finalSlotTime = triage.estimatedSlotTime;
      const mins = parseHHMMToMinutes(triage.estimatedSlotTime);
      finalSlotEndTime =
        mins === null
          ? queueSlot.slotEndTime
          : `${String(Math.floor((mins + triage.durationMinutes) / 60)).padStart(2, "0")}:${String((mins + triage.durationMinutes) % 60).padStart(2, "0")}`;
      finalQueuePosition = pickQueuePositionForTime(
        existingAppointments,
        triage.estimatedSlotTime,
      );
    }

    const appointment = new appointmentModel({
      userId,
      docId,
      userData,
      docData: docDataObj,
      amount: docData.fees,
      slotDate,
      slotTime: finalSlotTime,
      shiftId,
      shiftLabel: selectedShift.label,
      queuePosition: finalQueuePosition,
      durationMinutes: triage.durationMinutes,
      severityScore: triage.severityScore,
      urgencyTag: triage.urgencyTag || "ROUTINE",
      emergencyDetected: Boolean(triage.emergencyDetected),
      triageSource,
      estimatedWaitMinutes: Number(triage.estimatedWaitMinutes) || 0,
      maxWaitHours: Number(triage.maxWaitHours) || 0,
      recommendedSpecialty: triage.recommendedSpecialty || "",
      matchedSymptoms: Array.isArray(triage.matchedSymptoms)
        ? triage.matchedSymptoms
        : [],
      redFlags: Array.isArray(triage.redFlags) ? triage.redFlags : [],
      scoreBreakdown: triage.scoreBreakdown || {},
      schedulerPatientId: triage.schedulerPatientId || "",
      schedulerMessage: triage.schedulerMessage || "",
      symptoms,
      patientName,
      patientAge: Number(patientAge),
      date: Date.now(),
    });

    await appointment.save();
    res.json({
      success: true,
      message: "Appointment booked successfully",
      appointmentTime: finalSlotTime,
      appointmentEndTime: finalSlotEndTime,
      queuePosition: finalQueuePosition,
      shiftLabel: selectedShift.label,
      durationMinutes: triage.durationMinutes,
      severityScore: triage.severityScore,
      urgencyTag: triage.urgencyTag || "ROUTINE",
      emergencyDetected: Boolean(triage.emergencyDetected),
      estimatedWaitMinutes: Number(triage.estimatedWaitMinutes) || 0,
      maxWaitHours: Number(triage.maxWaitHours) || 0,
      recommendedSpecialty: triage.recommendedSpecialty || "",
      matchedSymptoms: Array.isArray(triage.matchedSymptoms)
        ? triage.matchedSymptoms
        : [],
      redFlags: Array.isArray(triage.redFlags) ? triage.redFlags : [],
      schedulerPatientId: triage.schedulerPatientId || "",
      schedulerMessage: triage.schedulerMessage || "",
      triageSource,
      schedulerFallbackUsed: triageSource !== "medical_scheduler",
      schedulerError,
      appointment,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error booking appointment", error });
  }
};

//API to get user appointments
const listAppointments = async (req, res) => {
  try {
    const userId = req.userId;

    await cancelMissedAppointmentsForUser(userId);

    const appointments = await appointmentModel.find({ userId });
    res.json({ success: true, appointments });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Error fetching user appointments",
      error: error.message,
    });
  }
};

// API to get a single appointment by ID for the authenticated user
const getAppointmentById = async (req, res) => {
  try {
    const userId = req.userId;
    const { id: appointmentId } = req.params;

    const appointment = await appointmentModel.findById(appointmentId);

    if (!appointment) {
      return res
        .status(404)
        .json({ success: false, message: "Appointment not found" });
    }

    if (appointment.userId !== userId) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized access" });
    }

    res.json({ success: true, appointment });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Error fetching appointment",
      error: error.message,
    });
  }
};

//API to cancel appointment
const cancelAppointment = async (req, res) => {
  try {
    const userId = req.userId;
    const { id: appointmentId } = req.params;

    if (!appointmentId) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide appointment ID" });
    }

    const appointment = await appointmentModel.findById(appointmentId);

    if (!appointment) {
      return res
        .status(404)
        .json({ success: false, message: "Appointment not found" });
    }

    // Verify appointment belongs to user
    if (appointment.userId !== userId) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized access" });
    }

    if (appointment.cancelled) {
      return res
        .status(400)
        .json({ success: false, message: "Appointment is already cancelled" });
    }

    // Update appointment to cancelled
    await appointmentModel.findByIdAndUpdate(appointmentId, {
      cancelled: true,
    });

    // Release the booked slot
    const { docId, slotDate, slotTime } = appointment;
    const docData = await doctorModel.findById(docId);

    if (docData) {
      let slots_booked = docData.slots_booked || {};

      if (slots_booked[slotDate]) {
        slots_booked[slotDate] = slots_booked[slotDate].filter(
          (slot) => slot !== slotTime,
        );

        // Remove date key if no slots left for that date
        if (slots_booked[slotDate].length === 0) {
          delete slots_booked[slotDate];
        }
      }

      await doctorModel.findByIdAndUpdate(docId, { slots_booked });
    }

    res.json({ success: true, message: "Appointment cancelled successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Error cancelling appointment",
      error: error.message,
    });
  }
};

export {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  bookAppointment,
  listAppointments,
  getAppointmentById,
  cancelAppointment,
};
