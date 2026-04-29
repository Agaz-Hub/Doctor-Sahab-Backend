import express from "express";
import authDoctor from "../middlewares/authDoctor.js";
import upload from "../middlewares/multer.js";
import {
  appointmentCancel,
  appointmentComplete,
  appointmentsDoctor,
  doctorDashboard,
  doctorList,
  doctorProfile,
  getAppointmentForAi,
  getDoctorById,
  loginDoctor,
  savePrescription,
  saveTranscript,
  updateProfile,
  uploadImage,
} from "../controllers/doctorController.js";

const doctorCompatRouter = express.Router();

const mapAppointmentIdToParams = (req, res, next) => {
  req.params.id = req.body?.appointmentId;
  next();
};

const mapDocIdToParams = (req, res, next) => {
  req.params.id = req.params.docId;
  next();
};

// Legacy doctor-side endpoints
doctorCompatRouter.post("/login", loginDoctor);
doctorCompatRouter.get("/list", doctorList);
doctorCompatRouter.get("/dashboard", authDoctor, doctorDashboard);
doctorCompatRouter.get("/appointments", authDoctor, appointmentsDoctor);
doctorCompatRouter.post(
  "/complete-appointment",
  authDoctor,
  mapAppointmentIdToParams,
  appointmentComplete,
);
doctorCompatRouter.post(
  "/cancel-appointment",
  authDoctor,
  mapAppointmentIdToParams,
  appointmentCancel,
);
doctorCompatRouter.get("/profile", authDoctor, doctorProfile);
doctorCompatRouter.post("/update-profile", authDoctor, updateProfile);
doctorCompatRouter.post(
  "/upload-image",
  authDoctor,
  upload.single("image"),
  uploadImage,
);
doctorCompatRouter.post("/save-prescription", authDoctor, savePrescription);
doctorCompatRouter.post("/save-transcript", authDoctor, saveTranscript);
doctorCompatRouter.get(
  "/appointment-for-ai/:appointmentId",
  authDoctor,
  getAppointmentForAi,
);
doctorCompatRouter.get("/:docId", mapDocIdToParams, getDoctorById);

export default doctorCompatRouter;
