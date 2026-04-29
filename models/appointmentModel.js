import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  docId: { type: String, required: true },
  slotDate: { type: String, required: true },
  slotTime: { type: String, required: true },
  shiftId: { type: String, default: "" },
  shiftLabel: { type: String, default: "" },
  queuePosition: { type: Number, default: 1 },
  durationMinutes: { type: Number, default: 20 },
  severityScore: { type: Number, default: 5 },
  urgencyTag: { type: String, default: "ROUTINE" },
  emergencyDetected: { type: Boolean, default: false },
  triageSource: { type: String, default: "fallback" },
  estimatedWaitMinutes: { type: Number, default: 0 },
  maxWaitHours: { type: Number, default: 0 },
  recommendedSpecialty: { type: String, default: "" },
  matchedSymptoms: { type: [String], default: [] },
  redFlags: { type: [String], default: [] },
  scoreBreakdown: { type: Object, default: {} },
  schedulerPatientId: { type: String, default: "" },
  schedulerMessage: { type: String, default: "" },
  symptoms: { type: String, default: "" },
  patientName: { type: String, default: "" },
  patientAge: { type: Number, default: 0 },
  userData: { type: Object, required: true },
  docData: { type: Object, required: true },
  amount: { type: Number, required: true },
  date: { type: Number, required: true },
  cancelled: { type: Boolean, default: false },
  iscompleted: { type: Boolean, default: false },

  prescription: { type: String, default: "" },
  transcript: { type: String, default: "" },
});

const appointmentModel =
  mongoose.models.appointment ||
  mongoose.model("appointment", appointmentSchema);

export default appointmentModel;
