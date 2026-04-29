import express from "express";
import {
  doctorList,
  getDoctorById,
  listSpecialities,
  getAvailableSlots,
  loginDoctor,
  appointmentsDoctor,
  getAppointmentById,
  appointmentComplete,
  appointmentCancel,
  doctorDashboard,
  doctorProfile,
  updateProfile,
} from "../controllers/doctorController.js";
import authDoctor from "../middlewares/authDoctor.js";

const doctorRouter = express.Router();

// Public routes (used by chatbot as tool calls)
doctorRouter.get("/", doctorList); // ?speciality=X&name=Y&available=true
doctorRouter.get("/specialities", listSpecialities); // list all specialities
doctorRouter.get("/:id", getDoctorById);
doctorRouter.get("/:id/slots", getAvailableSlots); // ?date=28_3_2026

// Auth
doctorRouter.post("/auth/login", loginDoctor);

// Authenticated doctor routes (scoped to /me)
doctorRouter.get("/me/appointments", authDoctor, appointmentsDoctor);
doctorRouter.get("/me/appointments/:id", authDoctor, getAppointmentById);
doctorRouter.patch(
  "/me/appointments/:id/complete",
  authDoctor,
  appointmentComplete,
);
doctorRouter.patch(
  "/me/appointments/:id/cancel",
  authDoctor,
  appointmentCancel,
);
doctorRouter.get("/me/dashboard", authDoctor, doctorDashboard);
doctorRouter.get("/me/profile", authDoctor, doctorProfile);
doctorRouter.put("/me/profile", authDoctor, updateProfile);

export default doctorRouter;
