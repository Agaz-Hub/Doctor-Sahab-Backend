import axios from "axios";

function normalizeSchedulerBaseUrl(value) {
  const fallback = "http://127.0.0.1:8000";
  const raw = String(value || fallback).trim();

  try {
    const parsed = new URL(raw);
    if (parsed.hostname === "0.0.0.0") {
      parsed.hostname = "127.0.0.1";
    }
    return parsed.origin;
  } catch (_error) {
    return fallback;
  }
}

const DEFAULT_MEDICAL_SCHEDULER_URL = normalizeSchedulerBaseUrl(
  process.env.MEDICAL_SCHEDULER_URL,
);

const URGENCY_TO_DURATION = {
  EMERGENCY: 40,
  URGENT: 30,
  SOON: 25,
  ROUTINE: 20,
};

function parseEstimatedTimeToHHMM(value) {
  if (!value || typeof value !== "string") return null;

  // Handles ISO datetime returned by scheduler, e.g. 2026-04-01T10:30:00
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    const hh = date.getHours().toString().padStart(2, "0");
    const mm = date.getMinutes().toString().padStart(2, "0");
    return `${hh}:${mm}`;
  }

  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (
    Number.isNaN(hh) ||
    Number.isNaN(mm) ||
    hh < 0 ||
    hh > 23 ||
    mm < 0 ||
    mm > 59
  ) {
    return null;
  }

  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function normalizeMedicalHistory(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

async function getSchedulerTriage(input) {
  const baseUrl = DEFAULT_MEDICAL_SCHEDULER_URL;

  const payload = {
    name: input.patientName,
    age: Number(input.patientAge),
    symptoms: input.symptoms,
    medical_history: normalizeMedicalHistory(input.medicalHistory),
    symptom_duration_days: Number(input.symptomDurationDays) || 1,
    pain_scale: Number(input.painScale) || 5,
    additional_notes: input.additionalNotes || "",
  };

  const response = await axios.post(`${baseUrl}/score-and-schedule`, payload, {
    timeout: 5000,
  });

  const data = response?.data || {};
  const severityScore = Number(data.severity_score);
  const urgencyTag = String(
    data.urgency_flag || data.urgency_tag || "ROUTINE",
  ).toUpperCase();
  const apiTimeBlock = Number(data.time_block_minutes);
  const estimatedWaitMinutes = Number(data.estimated_wait_minutes);
  const maxWaitHours = Number(data.max_wait_hours);
  const emergencyDetected =
    Boolean(data.emergency_flag) || urgencyTag === "EMERGENCY";

  if (!Number.isFinite(severityScore)) {
    throw new Error("Scheduler response missing severity score");
  }

  return {
    source: "medical_scheduler",
    severityScore: Math.max(0, Math.min(100, severityScore)),
    urgencyTag,
    durationMinutes:
      Number.isFinite(apiTimeBlock) && apiTimeBlock > 0
        ? apiTimeBlock
        : URGENCY_TO_DURATION[urgencyTag] || 20,
    emergencyDetected,
    recommendedSpecialty: data.recommended_specialty || "",
    estimatedWaitMinutes:
      Number.isFinite(estimatedWaitMinutes) && estimatedWaitMinutes >= 0
        ? estimatedWaitMinutes
        : 0,
    maxWaitHours:
      Number.isFinite(maxWaitHours) && maxWaitHours >= 0 ? maxWaitHours : 0,
    matchedSymptoms: Array.isArray(data.matched_symptoms)
      ? data.matched_symptoms
      : [],
    redFlags: Array.isArray(data.red_flags_detected)
      ? data.red_flags_detected
      : [],
    scoreBreakdown:
      data.score_breakdown && typeof data.score_breakdown === "object"
        ? data.score_breakdown
        : {},
    schedulerPatientId: data.patient_id || "",
    schedulerMessage: data.message || "",
    estimatedSlotTime: parseEstimatedTimeToHHMM(
      data.estimated_appointment_time,
    ),
    raw: data,
  };
}

export { getSchedulerTriage, parseEstimatedTimeToHHMM };
