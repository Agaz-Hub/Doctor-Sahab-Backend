import validator from "validator";
import bcrypt from "bcrypt";
import { v2 as cloudinary } from "cloudinary";
import doctorModel from "../models/doctorModel.js";
import appointmentModel from "../models/appointmentModel.js";
import userModel from "../models/userModel.js";
import jwt from "jsonwebtoken";

// API for adding doctor
const addDoctor = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      speciality,
      degree,
      experience,
      about,
      fees,
      address,
    } = req.body;
    const imageFile = req.file;

    if (
      !name ||
      !email ||
      !password ||
      !speciality ||
      !degree ||
      !experience ||
      !about ||
      !fees ||
      !address
    ) {
      return res.status(400).json({ success: false, message: "Missing Details" });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email" });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "Please enter a strong password" });
    }

    //hashing doctor password
    const salt = await bcrypt.genSalt(9);
    const hashedPassword = await bcrypt.hash(password, salt);

    // //upload image to cloudinary (using buffer from memory storage)
    const base64Image = `data:${imageFile.mimetype};base64,${imageFile.buffer.toString("base64")}`;
    const imageUpload = await cloudinary.uploader.upload(base64Image, {
      resource_type: "image",
      folder: "doctor_sahab",
    });
    const imageURL = imageUpload.secure_url;

    const doctorData = {
      name,
      email,
      password: hashedPassword,
      image: imageURL,
      speciality,
      degree,
      about,
      address: JSON.parse(address),
      experience,
      fees,
      date: Date.now(),
    };
    const newDoctor = new doctorModel(doctorData);
    await newDoctor.save();

    res.status(201).json({ success: true, message: "Doctor Added" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "error in adding doctor" });
  }
};

const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (
      email === process.env.ADMIN_EMAIL &&
      password === process.env.ADMIN_PASSWORD
    ) {
      const token = jwt.sign(email + password, process.env.JWT_SECRET);

      res.json({ success: true, token });
    } else {
      res.status(401).json({ success: false, message: "Invalid Credentials" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "error in login" });
  }
};

// API to get all doctor list
const allDoctors = async (req, res) => {
  try {
    const doctors = await doctorModel.find({}).select("-password");
    res.json({ success: true, doctors });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// API to get a single doctor by ID
const getDoctorById = async (req, res) => {
  try {
    const { id } = req.params;
    const doctor = await doctorModel.findById(id).select("-password");

    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    res.json({ success: true, doctor });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// API to delete a doctor
const deleteDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const doctor = await doctorModel.findById(id);

    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    // Delete doctor image from cloudinary if exists
    if (doctor.image) {
      try {
        const publicId = doctor.image.split('/').slice(-2).join('/').split('.')[0];
        await cloudinary.uploader.destroy(publicId);
      } catch (imgError) {
        console.log("Could not delete cloudinary image:", imgError.message);
      }
    }

    await doctorModel.findByIdAndDelete(id);
    res.json({ success: true, message: "Doctor deleted successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const appointmentsAdmin = async (req, res) => {
  try {
    const appointments = await appointmentModel.find({});
    res.json({ success: true, appointments });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// API to get a single appointment by ID
const getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await appointmentModel.findById(id);

    if (!appointment) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    res.json({ success: true, appointment });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const cancelAppointment = async (req, res) => {
  try {
    const { id: appointmentId } = req.params;

    if (!appointmentId) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide appointment ID" });
    }

    const appointment = await appointmentModel.findById(appointmentId);

    if (!appointment) {
      return res
        .status(404)
        .json({ success: false, message: "Appointment not found" });
    }

    if (appointment.cancelled) {
      return res
        .status(400)
        .json({ success: false, message: "Appointment is already cancelled" });
    }

    // Update appointment to cancelled
    await appointmentModel.findByIdAndUpdate(appointmentId, {
      cancelled: true,
    });

    // Release the booked slot
    const { docId, slotDate, slotTime } = appointment;
    const docData = await doctorModel.findById(docId);

    if (docData) {
      let slots_booked = docData.slots_booked || {};

      if (slots_booked[slotDate]) {
        slots_booked[slotDate] = slots_booked[slotDate].filter(
          (slot) => slot !== slotTime,
        );

        // Remove date key if no slots left for that date
        if (slots_booked[slotDate].length === 0) {
          delete slots_booked[slotDate];
        }
      }

      await doctorModel.findByIdAndUpdate(docId, { slots_booked });
    }

    res.json({ success: true, message: "Appointment cancelled successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Error cancelling appointment",
      error: error.message,
    });
  }
};

const adminDashboard = async (req, res) => {
  try {
    const doctors = await doctorModel.find({});
    const users = await userModel.find({});
    const appointment = await appointmentModel.find({});

    const dashData = {
      doctors: doctors.length,
      appointments: appointment.length,
      patients: users.length,
      listAppointments: appointment.reverse().slice(0, 5),
    };

    res.json({ success: true, dashData });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export {
  addDoctor,
  loginAdmin,
  allDoctors,
  getDoctorById,
  deleteDoctor,
  appointmentsAdmin,
  getAppointmentById,
  cancelAppointment,
  adminDashboard,
};
