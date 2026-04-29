/**
 * Tool executor — maps tool names to actual database operations.
 * Each handler directly queries Mongoose models and returns plain JSON.
 * Completely decoupled from AI logic.
 */

import doctorModel from "../../models/doctorModel.js";
import appointmentModel from "../../models/appointmentModel.js";
import userModel from "../../models/userModel.js";
import { getSeverityAndTimeBlock } from "../severityScorer.js";
import { getSchedulerTriage } from "../../utils/medicalSchedulerClient.js";
import {
  buildShiftAvailability,
  calculateQueueSlot,
  isPastDate,
  normalizeDoctorShifts,
} from "../../utils/shiftScheduler.js";

// ─── Individual Tool Handlers ────────────────────────────────────────────────

async function handleGetDoctors({ specialization, name }) {
  const filter = { available: true };

  if (specialization) {
    filter.speciality = { $regex: specialization, $options: "i" };
  }
  if (name) {
    filter.name = { $regex: name, $options: "i" };
  }

  const doctors = await doctorModel
    .find(filter)
    .select("-password -email")
    .limit(10)
    .lean();

  if (doctors.length === 0) {
    return {
      success: true,
      count: 0,
      doctors: [],
      message: `No available doctors found for "${specialization || "any"}" speciality.`,
    };
  }

  // Return a clean, concise version for the AI
  const result = doctors.map((doc) => ({
    id: doc._id.toString(),
    name: doc.name,
    speciality: doc.speciality,
    degree: doc.degree,
    experience: doc.experience,
    fees: doc.fees,
    available: doc.available,
    shifts: normalizeDoctorShifts(doc.shifts),
  }));

  return { success: true, count: result.length, doctors: result };
}

async function handleListSpecialities() {
  const specialities = await doctorModel.distinct("speciality");
  return { success: true, specialities };
}

async function handleGetAvailableSlots({ doctorId, date }) {
  const doctor = await doctorModel.findById(doctorId).lean();

  if (!doctor) {
    return { success: false, message: "Doctor not found." };
  }

  if (!doctor.available) {
    return {
      success: true,
      available: false,
      message: `Dr. ${doctor.name} is currently not available for appointments.`,
      slots: [],
    };
  }

  const shifts = normalizeDoctorShifts(doctor.shifts);
  const existingAppointments = await appointmentModel
    .find({ docId: doctorId, slotDate: date, cancelled: false })
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

  return {
    success: true,
    available: true,
    doctorId: doctorId,
    doctorName: doctor.name,
    date,
    shifts: shiftAvailability,
  };
}

async function handleBookAppointment({
  doctorId,
  date,
  shiftId,
  symptoms,
  patientName,
  patientAge,
  medicalHistory,
  symptomDurationDays,
  painScale,
  additionalNotes,
  userId,
}) {
  if (!userId) {
    return {
      success: false,
      message:
        "User must be logged in to book an appointment. Please ask the user to log in first.",
    };
  }

  const doctor = await doctorModel.findById(doctorId);
  if (!doctor) {
    return { success: false, message: "Doctor not found." };
  }

  if (!doctor.available) {
    return {
      success: false,
      message: `Dr. ${doctor.name} is not available for appointments.`,
    };
  }

  const user = await userModel.findById(userId).select("-password");
  if (!user) {
    return { success: false, message: "User not found." };
  }

  if (!shiftId || !symptoms || !patientName || !patientAge) {
    return {
      success: false,
      message:
        "Please provide shiftId, patientName, patientAge and symptoms to complete booking.",
    };
  }

  if (isPastDate(date)) {
    return {
      success: false,
      message: "Cannot book appointment for a past date.",
    };
  }

  const normalizedShifts = normalizeDoctorShifts(doctor.shifts);
  const selectedShift = normalizedShifts.find((shift) => shift.id === shiftId);
  if (!selectedShift) {
    return { success: false, message: "Invalid shift selected." };
  }

  let triageSource = "fallback";
  let schedulerError = null;
  let triage;

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
      docId: doctorId,
      slotDate: date,
      shiftId,
      cancelled: false,
    })
    .select("slotTime durationMinutes queuePosition")
    .sort({ queuePosition: 1, date: 1 });

  const queueSlot = calculateQueueSlot({
    shift: selectedShift,
    existingAppointments,
    durationMinutes: triage.durationMinutes,
    slotDate: date,
  });

  if (!queueSlot.success || queueSlot.isFull) {
    return {
      success: false,
      message: `The selected shift (${selectedShift.label}) is full. Please choose another shift.`,
    };
  }

  const docDataObj = doctor.toObject();
  delete docDataObj.slots_booked;
  delete docDataObj.password;

  const appointment = new appointmentModel({
    userId,
    docId: doctorId,
    userData: user.toObject(),
    docData: docDataObj,
    amount: doctor.fees,
    slotDate: date,
    slotTime: queueSlot.slotTime,
    shiftId,
    shiftLabel: selectedShift.label,
    queuePosition: queueSlot.queuePosition,
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

  return {
    success: true,
    message: "Appointment booked successfully!",
    appointment: {
      id: appointment._id.toString(),
      doctor: doctor.name,
      speciality: doctor.speciality,
      date,
      shift: selectedShift.label,
      time: queueSlot.slotTime,
      durationMinutes: triage.durationMinutes,
      severityScore: triage.severityScore,
      urgencyTag: triage.urgencyTag || "ROUTINE",
      emergencyDetected: Boolean(triage.emergencyDetected),
      estimatedWaitMinutes: Number(triage.estimatedWaitMinutes) || 0,
      recommendedSpecialty: triage.recommendedSpecialty || "",
      fees: doctor.fees,
    },
    triageSource,
    schedulerFallbackUsed: triageSource !== "medical_scheduler",
    schedulerError,
  };
}

async function handleCancelAppointment({ appointmentId, userId }) {
  if (!userId) {
    return {
      success: false,
      message: "User must be logged in to cancel an appointment.",
    };
  }

  const appointment = await appointmentModel.findById(appointmentId);

  if (!appointment) {
    return { success: false, message: "Appointment not found." };
  }

  if (appointment.userId !== userId) {
    return {
      success: false,
      message: "You are not authorized to cancel this appointment.",
    };
  }

  if (appointment.cancelled) {
    return {
      success: false,
      message: "This appointment is already cancelled.",
    };
  }

  // Cancel appointment
  await appointmentModel.findByIdAndUpdate(appointmentId, { cancelled: true });

  // Release the slot
  const { docId, slotDate, slotTime } = appointment;
  const doctor = await doctorModel.findById(docId);

  if (doctor) {
    const slots_booked = doctor.slots_booked || {};
    if (slots_booked[slotDate]) {
      slots_booked[slotDate] = slots_booked[slotDate].filter(
        (slot) => slot !== slotTime,
      );
      if (slots_booked[slotDate].length === 0) {
        delete slots_booked[slotDate];
      }
      await doctorModel.findByIdAndUpdate(docId, { slots_booked });
    }
  }

  return { success: true, message: "Appointment cancelled successfully." };
}

async function handleGetUserAppointments({ userId }) {
  if (!userId) {
    return {
      success: false,
      message: "User must be logged in to view their appointments.",
    };
  }

  const appointments = await appointmentModel
    .find({ userId })
    .sort({ date: -1 })
    .lean();

  if (appointments.length === 0) {
    return {
      success: true,
      count: 0,
      appointments: [],
      message: "You have no appointments booked.",
    };
  }

  const result = appointments.map((appt) => ({
    id: appt._id.toString(),
    doctorName: appt.docData?.name || "Unknown Doctor",
    speciality: appt.docData?.speciality || "Unknown",
    date: appt.slotDate,
    shift: appt.shiftLabel || "",
    time: appt.slotTime,
    durationMinutes: appt.durationMinutes || 20,
    severityScore: appt.severityScore || 5,
    urgencyTag: appt.urgencyTag || "ROUTINE",
    emergencyDetected: Boolean(appt.emergencyDetected),
    triageSource: appt.triageSource || "fallback",
    estimatedWaitMinutes: appt.estimatedWaitMinutes || 0,
    fees: appt.amount,
    cancelled: appt.cancelled,
    isCompleted: appt.iscompleted,
  }));

  return { success: true, count: result.length, appointments: result };
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

const toolHandlers = {
  getDoctors: handleGetDoctors,
  listSpecialities: handleListSpecialities,
  getAvailableSlots: handleGetAvailableSlots,
  bookAppointment: handleBookAppointment,
  cancelAppointment: handleCancelAppointment,
  getUserAppointments: handleGetUserAppointments,
};

/**
 * Execute a tool by name with the given arguments.
 * @param {string} toolName - Name of the tool to execute.
 * @param {object} args - Arguments for the tool.
 * @returns {Promise<object>} - Result of the tool execution.
 */
async function executeTool(toolName, args) {
  const handler = toolHandlers[toolName];

  if (!handler) {
    return { success: false, message: `Unknown tool: "${toolName}".` };
  }

  try {
    const result = await handler(args);
    return result;
  } catch (error) {
    console.error(`[AI Tool Error] ${toolName}:`, error.message);
    return {
      success: false,
      message: `An error occurred while executing "${toolName}". Please try again.`,
    };
  }
}

export { executeTool };
