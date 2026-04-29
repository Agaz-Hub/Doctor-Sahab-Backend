// Dummy severity module. Replace this with a real ML/LLM model later.
function getSeverityAndTimeBlock({ symptoms }) {
  const normalizedSymptoms =
    typeof symptoms === "string" ? symptoms.trim() : "";

  const text = normalizedSymptoms.toLowerCase();
  const emergencyKeywords = [
    "chest pain",
    "shortness of breath",
    "seizure",
    "stroke",
    "unconscious",
    "heavy bleeding",
  ];
  const urgentKeywords = ["high fever", "vomiting", "severe pain", "dizziness"];

  let severityScore = 45;
  if (emergencyKeywords.some((keyword) => text.includes(keyword))) {
    severityScore = 90;
  } else if (urgentKeywords.some((keyword) => text.includes(keyword))) {
    severityScore = 72;
  }

  let durationMinutes = 20;
  if (severityScore >= 90) {
    durationMinutes = 45;
  } else if (severityScore >= 75) {
    durationMinutes = 35;
  } else if (severityScore >= 55) {
    durationMinutes = 30;
  }

  return {
    severityScore,
    durationMinutes,
    summary: normalizedSymptoms || "General consultation",
  };
}

export { getSeverityAndTimeBlock };
