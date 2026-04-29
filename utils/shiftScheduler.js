const DEFAULT_SHIFTS = [
  {
    id: "shift_1",
    label: "1st Shift",
    startTime: "09:00",
    endTime: "12:00",
  },
  {
    id: "shift_2",
    label: "2nd Shift",
    startTime: "14:00",
    endTime: "17:00",
  },
];

function parseHHMMToMinutes(time) {
  if (!time || typeof time !== "string" || !time.includes(":")) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function parseSlotDate(slotDate) {
  if (!slotDate || typeof slotDate !== "string") return null;
  const [d, m, y] = slotDate.split("_").map(Number);
  if (!d || !m || !y) return null;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function isPastDate(slotDate) {
  const date = parseSlotDate(slotDate);
  if (!date) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date < today;
}

function isTodayDate(slotDate) {
  const date = parseSlotDate(slotDate);
  if (!date) return false;
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function minutesToHHMM(totalMinutes) {
  const clamped = Math.max(0, totalMinutes);
  const hours = Math.floor(clamped / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (clamped % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function to12Hour(time24) {
  const mins = parseHHMMToMinutes(time24);
  if (mins === null) return time24;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${suffix}`;
}

function normalizeDoctorShifts(shifts) {
  if (!Array.isArray(shifts) || shifts.length === 0) {
    return DEFAULT_SHIFTS;
  }

  const validShifts = shifts
    .map((shift, index) => ({
      id: shift?.id || `shift_${index + 1}`,
      label: shift?.label || `${index + 1}th Shift`,
      startTime: shift?.startTime,
      endTime: shift?.endTime,
    }))
    .filter((shift) => {
      const start = parseHHMMToMinutes(shift.startTime);
      const end = parseHHMMToMinutes(shift.endTime);
      return start !== null && end !== null && start < end;
    });

  return validShifts.length > 0 ? validShifts : DEFAULT_SHIFTS;
}

function calculateQueueSlot({
  shift,
  existingAppointments,
  durationMinutes,
  slotDate,
}) {
  if (slotDate && isPastDate(slotDate)) {
    return {
      success: false,
      message: "Cannot book appointments for past dates.",
      isFull: true,
    };
  }

  const startMinutes = parseHHMMToMinutes(shift.startTime);
  const endMinutes = parseHHMMToMinutes(shift.endTime);

  if (
    startMinutes === null ||
    endMinutes === null ||
    startMinutes >= endMinutes
  ) {
    return { success: false, message: "Invalid shift timing." };
  }

  const safeDuration =
    Number(durationMinutes) > 0 ? Number(durationMinutes) : 20;
  const capacityMinutes = endMinutes - startMinutes;

  const sortedAppointments = [...(existingAppointments || [])].sort((a, b) => {
    const aStart = parseHHMMToMinutes(a.slotTime) ?? startMinutes;
    const bStart = parseHHMMToMinutes(b.slotTime) ?? startMinutes;
    return aStart - bStart;
  });

  let cursor = startMinutes;

  // For same-day booking, queue cannot start in the past.
  if (slotDate && isTodayDate(slotDate)) {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    cursor = Math.max(cursor, nowMinutes);

    // Add a small prep buffer only when there is no active/upcoming queue from now.
    const hasActiveOrUpcomingQueue = (existingAppointments || []).some(
      (appointment) => {
        const apptStart = parseHHMMToMinutes(appointment.slotTime);
        if (apptStart === null) return false;
        const apptDuration = Number(appointment.durationMinutes) || 20;
        const apptEnd = apptStart + apptDuration;
        return apptEnd > nowMinutes;
      },
    );

    if (!hasActiveOrUpcomingQueue) {
      cursor += 5;
    }
  }

  for (const appointment of sortedAppointments) {
    const apptStart = parseHHMMToMinutes(appointment.slotTime);
    const apptDuration = Number(appointment.durationMinutes) || 20;

    if (apptStart === null) continue;

    // Found a gap where this new booking can fit.
    if (apptStart - cursor >= safeDuration) {
      break;
    }

    cursor = Math.max(cursor, apptStart + apptDuration);
  }

  const nextStart = cursor;
  const nextEnd = nextStart + safeDuration;
  const usedMinutes = Math.max(0, nextStart - startMinutes);

  if (nextEnd > endMinutes) {
    return {
      success: false,
      message: "Selected shift is full.",
      isFull: true,
      capacityMinutes,
      usedMinutes,
    };
  }

  return {
    success: true,
    isFull: false,
    slotTime: minutesToHHMM(nextStart),
    slotEndTime: minutesToHHMM(nextEnd),
    slotTimeLabel: to12Hour(minutesToHHMM(nextStart)),
    slotEndTimeLabel: to12Hour(minutesToHHMM(nextEnd)),
    queuePosition: (existingAppointments || []).length + 1,
    capacityMinutes,
    usedMinutes,
    remainingMinutes: endMinutes - nextEnd,
  };
}

function buildShiftAvailability({ shifts, appointmentsByShift, slotDate }) {
  return shifts.map((shift) => {
    const existing = appointmentsByShift[shift.id] || [];

    const start = parseHHMMToMinutes(shift.startTime);
    const end = parseHHMMToMinutes(shift.endTime);
    const capacityMinutes =
      start !== null && end !== null ? Math.max(0, end - start) : 0;

    const nextSlot = calculateQueueSlot({
      shift,
      existingAppointments: existing,
      durationMinutes: 20,
      slotDate,
    });

    const isFull = !nextSlot.success || nextSlot.isFull;

    return {
      id: shift.id,
      label: shift.label,
      startTime: shift.startTime,
      endTime: shift.endTime,
      capacityMinutes,
      usedMinutes: isFull ? capacityMinutes : nextSlot.usedMinutes || 0,
      remainingMinutes: isFull
        ? 0
        : Math.max(0, capacityMinutes - ((nextSlot.usedMinutes || 0) + 20)),
      queueCount: existing.length,
      isFull,
      nextSlotTime: !isFull ? nextSlot.slotTime : null,
      nextSlotTimeLabel: !isFull ? nextSlot.slotTimeLabel : null,
    };
  });
}

export {
  DEFAULT_SHIFTS,
  normalizeDoctorShifts,
  parseHHMMToMinutes,
  parseSlotDate,
  isPastDate,
  isTodayDate,
  calculateQueueSlot,
  buildShiftAvailability,
};
