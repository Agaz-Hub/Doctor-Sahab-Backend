/**
 * Gemini function declarations for the Doctor Sahab AI agent.
 * Each tool is atomic, well-described, and validated.
 */

const toolDefinitions = [
  {
    name: "getDoctors",
    description:
      "Search for doctors on the platform by speciality and/or name. Returns a list of matching doctors with their details (name, speciality, experience, fees, availability). Always use this tool when the user wants to find a doctor.",
    parameters: {
      type: "object",
      properties: {
        specialization: {
          type: "string",
          description:
            'The medical speciality to search for (e.g., "General Physician", "Cardiologist", "Dermatologist", "Pediatrician", "Neurologist", "Gynecologist", "Orthopedic"). Case-insensitive partial match.',
        },
        name: {
          type: "string",
          description:
            "Optional. Doctor name to search for. Case-insensitive partial match.",
        },
      },
      required: ["specialization"],
    },
  },
  {
    name: "listSpecialities",
    description:
      "Get the list of all medical specialities available on the platform. Use this when you need to know what specialities exist or when the user asks what types of doctors are available.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "getAvailableSlots",
    description:
      'Get shift-wise appointment availability for a specific doctor on a specific date. Returns doctor shifts with remaining capacity and whether each shift is full. The date must be in "DD_M_YYYY" format (e.g., "28_3_2026").',
    parameters: {
      type: "object",
      properties: {
        doctorId: {
          type: "string",
          description: "The MongoDB ObjectId of the doctor.",
        },
        date: {
          type: "string",
          description:
            'The date to check availability for, in "DD_M_YYYY" format (e.g., "28_3_2026").',
        },
      },
      required: ["doctorId", "date"],
    },
  },
  {
    name: "bookAppointment",
    description:
      "Book an appointment with a doctor for a specific date and shift. Requires symptoms and patient details so the system can compute severity score and required time block. Requires an authenticated user (userId). Use this only after confirming the shift has capacity and the user has agreed.",
    parameters: {
      type: "object",
      properties: {
        doctorId: {
          type: "string",
          description: "The MongoDB ObjectId of the doctor to book with.",
        },
        date: {
          type: "string",
          description:
            'The appointment date in "DD_M_YYYY" format (e.g., "28_3_2026").',
        },
        shiftId: {
          type: "string",
          description:
            'The selected doctor shift ID (e.g., "shift_1", "shift_2").',
        },
        patientName: {
          type: "string",
          description: "Patient name for this appointment.",
        },
        patientAge: {
          type: "number",
          description: "Patient age in years.",
        },
        symptoms: {
          type: "string",
          description:
            "Patient symptoms used to generate severity score and consultation duration.",
        },
        userId: {
          type: "string",
          description:
            "The MongoDB ObjectId of the user booking the appointment. This is provided by the system from the auth token.",
        },
      },
      required: [
        "doctorId",
        "date",
        "shiftId",
        "patientName",
        "patientAge",
        "symptoms",
        "userId",
      ],
    },
  },
  {
    name: "cancelAppointment",
    description:
      "Cancel an existing appointment by its ID. Requires the appointment ID and the user ID for authorization. The cancelled slot will be released and become available again.",
    parameters: {
      type: "object",
      properties: {
        appointmentId: {
          type: "string",
          description: "The MongoDB ObjectId of the appointment to cancel.",
        },
        userId: {
          type: "string",
          description:
            "The MongoDB ObjectId of the user requesting cancellation. Used for authorization.",
        },
      },
      required: ["appointmentId", "userId"],
    },
  },
  {
    name: "getUserAppointments",
    description:
      "Get all upcoming or past appointments for the authenticated user. Requires the user ID for authorization. Returns the list of appointments with doctor details, date, time, and status. Use this when the user wants to check, view, or list their appointments.",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description:
            "The MongoDB ObjectId of the user checking their appointments. This is provided by the system from the auth token.",
        },
      },
      required: ["userId"],
    },
  },
];

export default toolDefinitions;
