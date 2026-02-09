import validator from "validator";
import bcrypt from "bcrypt";
import userModel from "../models/userModel.js";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import doctorModel from "../models/doctorModel.js";
import appointmentModel from "../models/appointmentModel.js";

// API to register user
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "Please provide name, email and password" });
    }

    //validating password length
    if (password.length < 8) {
      return res
        .status(400)
        .json({
          success: fail,
          message: "Password must be at least 6 characters long",
        });
    }

    //validating email format
    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: "Please provide a valid email" });
    }

    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User already exists with this email" });
    }

    //hashing user password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new userModel({ name, email, password: hashedPassword });
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.json({ success: true, token });
  } catch (error) {
    res.status(500).json({ message: "Error registering user", error });
  }
};

// API to login user
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Please provide email and password" });
    }

    const user = await userModel.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.json({ success: true, token });
  } catch (error) {
    res.status(500).json({ message: "Error logging in user", error });
  }
};

//API to get Profile of logged in user
const getProfile = async (req, res) => {
  try {
    const userId = req.userId; // Assuming user ID is set in req.body by auth middleware
    const user = await userModel.findById(userId).select("-password"); // Exclude password from the response
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: "Error fetching user profile", error });
  }
};

//API to update Profile of logged in user
const updateProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const { name, phone, address, dob, gender } = req.body;
    const imageFile = req.file;

    if (!name && !phone && !address && !dob && !gender && !imageFile) {
      return res
        .status(400)
        .json({ message: "Please provide at least one field to update" });
    }

    await userModel.findByIdAndUpdate(userId, {
      name,
      phone,
      address: JSON.parse(address || "{}"),
      dob,
      gender,
    });

    if (imageFile) {
      // Upload using buffer from memory storage
      const base64Image = `data:${imageFile.mimetype};base64,${imageFile.buffer.toString("base64")}`;
      const uploadResponse = await cloudinary.uploader.upload(base64Image, {
        resource_type: "image",
      });
      await userModel.findByIdAndUpdate(userId, {
        image: uploadResponse.secure_url,
      });
    }

    res.json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error updating user profile", error });
  }
};

// API to book appointment
const bookAppointment = async (req, res) => {
  try {
    const userId = req.userId;
    const { docId, slotDate, slotTime } = req.body;

    if (!docId || !slotDate || !slotTime) {
      return res
        .status(400)
        .json({ message: "Please provide all required fields" });
    }

    const docData = await doctorModel.findById(docId).select("-password");
    const userData = await userModel.findById(userId).select("-password");

    if (!docData) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    if (!userData) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!docData.available) {
      return res
        .status(400)
        .json({ message: "Doctor is not available for appointment" });
    }

    let slots_booked = docData.slots_booked || {};

    //checking for slot availability
    if (slots_booked[slotDate] && slots_booked[slotDate].includes(slotTime)) {
      return res.status(400).json({
        message: "Selected slot is already booked. Please choose another slot.",
      });
    } else {
      //booking the slot
      if (slots_booked[slotDate]) {
        slots_booked[slotDate].push(slotTime);
      } else {
        slots_booked[slotDate] = [slotTime];
      }
    }

    const docDataObj = docData.toObject();
    delete docDataObj.slots_booked;

    const appointment = new appointmentModel({
      userId,
      docId,
      userData,
      docData: docDataObj,
      amount: docData.fees,
      slotDate,
      slotTime,
      date: Date.now(),
    });

    await appointment.save();
    await doctorModel.findByIdAndUpdate(docId, { slots_booked });
    res.json({
      success: true,
      message: "Appointment booked successfully",
      appointment,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error booking appointment", error });
  }
};

//API to get user appointments
const listAppointments = async (req, res) => {
  try {
    const userId = req.userId;
    const appointments = await appointmentModel.find({ userId });
    res.json({ success: true, appointments });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Error fetching user appointments",
      error: error.message,
    });
  }
};

//API to cancel appointment
const cancelAppointment = async (req, res) => {
  try {
    const userId = req.userId;
    const { appointmentId } = req.body;

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

    // Verify appointment belongs to user
    if (appointment.userId !== userId) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized access" });
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

export {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  bookAppointment,
  listAppointments,
  cancelAppointment,
};
