// import { JsonWebTokenError }   from "jsonwebtoken"
import jwt from "jsonwebtoken";
import doctorModel from "../models/doctorModel.js";
import bcrypt from "bcrypt";
import { v2 as cloudinary } from "cloudinary";
import appointmentModel from "../models/appointmentModel.js";
import {
  buildShiftAvailability,
  normalizeDoctorShifts,
} from "../utils/shiftScheduler.js";

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
  const parsedDate = parseSlotDateValue(slotDate);
  if (!parsedDate) return null;

  const { hours, minutes } = parseSlotTimeValue(slotTime);
  return new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate(),
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

const cancelMissedAppointments = async (docId) => {
  const now = new Date();
  const items = await appointmentModel.find({
    docId,
    cancelled: false,
    iscompleted: false,
  });
  const idsToCancel = [];

  items.forEach((item) => {
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

const changeAvailability = async (req, res) => {
  try {
    const docId = req.params.id || req.docId;

    const docData = await doctorModel.findById(docId);
    await doctorModel.findByIdAndUpdate(docId, {
      available: !docData.available,
    });
    res.json({ success: true, message: "availability Cahnged" });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

const doctorList = async (req, res) => {
  try {
    const { speciality, name, available } = req.query;

    // Build filter object for chatbot tool-calling support
    const filter = {};
    if (speciality) {
      filter.speciality = { $regex: speciality, $options: "i" };
    }
    if (name) {
      filter.name = { $regex: name, $options: "i" };
    }
    if (available !== undefined) {
      filter.available = available === "true";
    }

    const doctors = await doctorModel
      .find(filter)
      .select(["-password", "-email"]);
    const doctorsWithShifts = doctors.map((doc) => {
      const docObj = doc.toObject();
      docObj.shifts = normalizeDoctorShifts(docObj.shifts);
      return docObj;
    });
    res.json({
      success: true,
      count: doctorsWithShifts.length,
      doctors: doctorsWithShifts,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// API to get all distinct specialities (for chatbot to discover options)
const listSpecialities = async (req, res) => {
  try {
    const specialities = await doctorModel.distinct("speciality");
    res.json({ success: true, specialities });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// API to get available slots for a doctor on a given date (for chatbot booking flow)
const getAvailableSlots = async (req, res) => {
  try {
    const { id: docId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide a date query parameter (e.g., ?date=28_3_2026)",
      });
    }

    const doctor = await doctorModel.findById(docId);
    if (!doctor) {
      return res
        .status(404)
        .json({ success: false, message: "Doctor not found" });
    }

    if (!doctor.available) {
      return res.json({
        success: true,
        available: false,
        message: "Doctor is currently not available for appointments",
        slots: [],
      });
    }

    const shifts = normalizeDoctorShifts(doctor.shifts);
    const existingAppointments = await appointmentModel
      .find({ docId, slotDate: date, cancelled: false })
      .select("shiftId slotTime durationMinutes queuePosition")
      .sort({ queuePosition: 1, date: 1 })
      .lean();

    const appointmentsByShift = existingAppointments.reduce((acc, item) => {
      const key = item.shiftId || "shift_1";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    const shiftAvailability = buildShiftAvailability({
      shifts,
      appointmentsByShift,
      slotDate: date,
    });

    res.json({
      success: true,
      available: true,
      doctorId: docId,
      doctorName: doctor.name,
      date,
      shifts: shiftAvailability,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getDoctorById = async (req, res) => {
  try {
    const { id: docId } = req.params;
    const doctor = await doctorModel
      .findById(docId)
      .select(["-password", "-email"]);

    if (!doctor) {
      return res
        .status(404)
        .json({ success: false, message: "Doctor not found" });
    }

    const doctorObj = doctor.toObject();
    doctorObj.shifts = normalizeDoctorShifts(doctorObj.shifts);

    res.json({ success: true, doctor: doctorObj });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const loginDoctor = async (req, res) => {
  try {
    const { email, password } = req.body;
    const doctor = await doctorModel.findOne({ email });

    if (!doctor) {
      return res
        .status(401)
        .json({ success: false, message: "invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, doctor.password);
    console.log("matched");

    if (isMatch) {
      const token = jwt.sign({ id: doctor._id }, process.env.JWT_SECRET);

      res.json({ success: true, token });
    } else {
      res.status(401).json({ success: false, message: "invalid credentials" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const appointmentsDoctor = async (req, res) => {
  try {
    const docId = req.docId;
    await cancelMissedAppointments(docId);
    const appointments = await appointmentModel.find({ docId });

    res.json({ success: true, appointments });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// API to get a single appointment by ID for the authenticated doctor
const getAppointmentById = async (req, res) => {
  try {
    const docId = req.docId;
    const { id: appointmentId } = req.params;

    const appointment = await appointmentModel.findById(appointmentId);

    if (!appointment) {
      return res
        .status(404)
        .json({ success: false, message: "Appointment not found" });
    }

    if (appointment.docId !== docId) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized access" });
    }

    res.json({ success: true, appointment });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const appointmentComplete = async (req, res) => {
  try {
    const docId = req.docId;
    const { id: appointmentId } = req.params;

    const appointmentData = await appointmentModel.findById(appointmentId);

    if (appointmentData && appointmentData.docId == docId) {
      await appointmentModel.findByIdAndUpdate(appointmentId, {
        iscompleted: true,
      });
      return res.json({ success: true, message: "Appointment Completed" });
    } else {
      return res.status(403).json({ success: false, message: "Mark failed" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const appointmentCancel = async (req, res) => {
  try {
    const docId = req.docId;
    const { id: appointmentId } = req.params;

    const appointmentData = await appointmentModel.findById(appointmentId);

    if (appointmentData && appointmentData.docId == docId) {
      await appointmentModel.findByIdAndUpdate(appointmentId, {
        cancelled: true,
      });
      return res.json({ success: true, message: "Appointment Cancelled" });
    } else {
      return res
        .status(403)
        .json({ success: false, message: "Cancellation failed" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const doctorDashboard = async (req, res) => {
  try {
    const docId = req.docId;
    if (!docId) {
      return res
        .status(400)
        .json({ success: false, message: "Doctor ID missing" });
    }

    await cancelMissedAppointments(docId);

    const allAppointments = await appointmentModel.find({ docId });
    const now = new Date();
    const appointments = allAppointments.filter((item) => {
      if (item.cancelled || item.iscompleted) return false;
      const { end } = getAppointmentWindow(item);
      return Boolean(end && end >= now);
    });

    let earnings = 0;
    allAppointments.forEach((item) => {
      if (item.iscompleted) {
        earnings += item.amount;
      }
    });

    const patients = [...new Set(appointments.map((a) => a.userId.toString()))];

    const dashData = {
      earnings,
      appointments: appointments.length,
      patients: patients.length,
      latestAppointments: appointments
        .sort(
          (a, b) =>
            parseAppointmentDateTime(a.slotDate, a.slotTime) -
            parseAppointmentDateTime(b.slotDate, b.slotTime),
        )
        .slice(0, 5),
    };

    console.log("🟩 Sending dashboard data");
    res.json({ success: true, dashData });
  } catch (error) {
    console.log("❌ doctorDashboard Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const doctorProfile = async (req, res) => {
  try {
    const docId = req.docId;
    const profileData = await doctorModel.findById(docId).select("-password");
    console.log(profileData);
    res.json({ success: true, profileData });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const docId = req.docId;
    const {
      fees,
      address,
      available,
      shifts,
      about,
      image,
      experience,
      degree,
      speciality,
    } = req.body;

    const updates = {
      fees,
      address,
      available,
      about,
      image,
      experience,
      degree,
      speciality,
    };

    if (Array.isArray(shifts)) {
      updates.shifts = normalizeDoctorShifts(shifts);
    }

    await doctorModel.findByIdAndUpdate(docId, updates);

    res.json({ success: true, message: "Profile Updated" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const uploadImage = async (req, res) => {
  try {
    const imageFile = req.file;

    if (!imageFile) {
      return res
        .status(400)
        .json({ success: false, message: "No image file provided" });
    }

    const base64Image = `data:${imageFile.mimetype};base64,${imageFile.buffer.toString("base64")}`;
    const imageUpload = await cloudinary.uploader.upload(base64Image, {
      resource_type: "image",
      folder: "doctor_sahab",
    });

    res.json({
      success: true,
      imageUrl: imageUpload.secure_url,
      message: "Image uploaded successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const savePrescription = async (req, res) => {
  try {
    const docId = req.docId;
    const { appointmentId, prescription } = req.body;

    const appointment = await appointmentModel.findById(appointmentId);
    if (!appointment || appointment.docId !== docId) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found or unauthorized",
      });
    }

    await appointmentModel.findByIdAndUpdate(appointmentId, { prescription });
    res.json({ success: true, message: "Prescription saved successfully" });
  } catch (error) {
    console.error("Save Prescription Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const saveTranscript = async (req, res) => {
  try {
    const docId = req.docId;
    const { appointmentId, transcript } = req.body;

    const appointment = await appointmentModel.findById(appointmentId);
    if (!appointment || appointment.docId !== docId) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found or unauthorized",
      });
    }

    await appointmentModel.findByIdAndUpdate(appointmentId, { transcript });
    res.json({ success: true, message: "Transcript saved successfully" });
  } catch (error) {
    console.error("Save Transcript Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAppointmentForAi = async (req, res) => {
  try {
    const docId = req.docId;
    const { appointmentId } = req.params;

    const appointment = await appointmentModel.findById(appointmentId);
    if (!appointment || appointment.docId !== docId) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found or unauthorized",
      });
    }

    const transcript = appointment.transcript || "";

    res.json({
      success: true,
      appointmentData: {
        _id: appointment._id,
        userData: appointment.userData,
        transcript,
        prescription: appointment.prescription,
        slotDate: appointment.slotDate,
        slotTime: appointment.slotTime,
      },
    });
  } catch (error) {
    console.error("Get Appointment for AI Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export {
  doctorList,
  getDoctorById,
  listSpecialities,
  getAvailableSlots,
  changeAvailability,
  loginDoctor,
  appointmentsDoctor,
  getAppointmentById,
  appointmentComplete,
  appointmentCancel,
  doctorDashboard,
  doctorProfile,
  updateProfile,
  uploadImage,
  savePrescription,
  saveTranscript,
  getAppointmentForAi,
};
