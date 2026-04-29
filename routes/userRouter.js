import express from "express";
import {
  getProfile,
  loginUser,
  registerUser,
  updateProfile,
  bookAppointment,
  listAppointments,
  getAppointmentById,
  cancelAppointment,
} from "../controllers/userController.js";
import authUser from "../middlewares/authUser.js";
import upload from "../middlewares/multer.js";

const userRouter = express.Router();

// Auth
userRouter.post("/auth/register", registerUser);
userRouter.post("/auth/login", loginUser);

// Authenticated user routes (scoped to /me)
userRouter.get("/me/profile", authUser, getProfile);
userRouter.put("/me/profile", upload.single("image"), authUser, updateProfile);

// Appointments
userRouter.post("/me/appointments", authUser, bookAppointment);
userRouter.get("/me/appointments", authUser, listAppointments);
userRouter.get("/me/appointments/:id", authUser, getAppointmentById);
userRouter.patch("/me/appointments/:id/cancel", authUser, cancelAppointment);

export default userRouter;
