import express from "express";
import {
  doctorList,
  getDoctorById,
  loginDoctor,
  appointmentsDoctor,
  appointmentComplete,
  appointmentCancel,
  doctorDashboard,
  doctorProfile,
  updateProfile,
} from "../controllers/doctorController.js";
import authDoctor from "../middlewares/authDoctor.js";
import appointmentModel from "../models/appointmentModel.js";
import twilio from "twilio";
import crypto from "crypto";
import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";

const doctorRouter = express.Router();

doctorRouter.get("/list", doctorList);
doctorRouter.get("/:docId", getDoctorById);
doctorRouter.post("/login", loginDoctor);
doctorRouter.get("/appointments", authDoctor, appointmentsDoctor);
doctorRouter.post("/complete-appointment", authDoctor, appointmentComplete);
doctorRouter.post("/cancel-appointment", authDoctor, appointmentCancel);
doctorRouter.get("/dashboard", authDoctor, doctorDashboard);
doctorRouter.get("/profile", authDoctor, doctorProfile);
doctorRouter.post("/update-profile", authDoctor, updateProfile);

// Twilio setup
const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
const fromNumber = process.env.TWILIO_PHONE;

const ZEGO_APP_ID = Number(process.env.ZEGO_APP_ID);
const ZEGO_SERVER_SECRET = process.env.ZEGO_SERVER_SECRET;

// Note: Ensure 'jwt', 'crypto', 'appointmentModel', and 'authDoctor' are properly imported.

// ✅ Generate Zego KitToken for Doctor
doctorRouter.get("/zego-token/:appointmentId", authDoctor, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await appointmentModel.findById(appointmentId);

    if (!appointment) {
      return res
        .status(404)
        .json({ success: false, message: "Appointment not found" });
    }

    if (!appointment.roomId) {
      appointment.roomId = crypto.randomBytes(8).toString("hex");
      // Use the actual domain instead of localhost for a deployed app
      appointment.videoCallLink = `http://localhost:5174/room/${appointment.roomId}`;
      await appointment.save();
    }

    // The Zego user ID for the doctor
    const userId = `doctor_${appointment.docId}`;

    // Create a JWT for Zego token
    const exp = Math.floor(Date.now() / 1000) + 3600; // 1 hour expiration
    const payload = {
      app_id: ZEGO_APP_ID,
      room_id: appointment.roomId,
      user_id: userId,
      privilege: { 1: 1, 2: 1 }, // 1=Join Room, 2=Publish Stream
      exp,
    };

    const token = jwt.sign(payload, ZEGO_SERVER_SECRET, { algorithm: "HS256" });

    // ✅ Proper KitToken format: appID_roomID_userID_token
    // Ensure ZEGO_APP_ID is treated as a string when concatenated
    const kitToken = `${ZEGO_APP_ID.toString()}_${appointment.roomId}_${userId}_${token}`;

    console.log(kitToken);
    res.json({
      success: true,
      kitToken,
      roomId: appointment.roomId,
      videoCallLink: appointment.videoCallLink,
    });
  } catch (error) {
    console.error("Error generating Zego doctor token:", error);
    res
      .status(500)
      .json({ success: false, message: "Error generating Zego doctor token" });
  }
});

// ✅ Generate Zego KitToken for Patient (Joiner)
doctorRouter.get("/zego-token-join/:roomId", async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const userId = "patient_" + crypto.randomBytes(4).toString("hex"); // Unique patient ID

    const exp = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour expiration

    const payload = {
      app_id: ZEGO_APP_ID,
      room_id: roomId,
      user_id: userId,
      privilege: { 1: 1, 2: 1 }, // 1=Join Room, 2=Publish Stream
      exp,
    };

    const token = jwt.sign(payload, ZEGO_SERVER_SECRET, { algorithm: "HS256" });

    // 🚨 FIX: kitToken was missing the concatenation step and was undefined in the response.
    const kitToken = `${ZEGO_APP_ID.toString()}_${roomId}_${userId}_${token}`;

    res.json({ success: true, kitToken, roomId });
  } catch (error) {
    console.error("Error generating Zego join token:", error);
    res
      .status(500)
      .json({ success: false, message: "Error generating join token" });
  }
});
export default doctorRouter;
