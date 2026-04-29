import mongoose from "mongoose";

const shiftSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
  },
  { _id: false },
);

const defaultShifts = [
  {
    id: "shift_1",
    label: "1st Shift",
    startTime: "00:00",
    endTime: "12:00",
  },
  {
    id: "shift_2",
    label: "2nd Shift",
    startTime: "14:00",
    endTime: "23:50",
  },
];

const doctorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    image: { type: String, required: true },
    speciality: { type: String, required: true },
    degree: { type: String, required: true },
    experience: { type: String, required: true },
    about: { type: String, required: true },
    available: { type: Boolean, default: true },
    fees: { type: Number, required: true },
    address: { type: Object, required: true },
    date: { type: Number, required: true },
    shifts: { type: [shiftSchema], default: defaultShifts },
    slots_booked: { type: Object, default: {} },
  },
  { minimize: false },
);

const doctorModel =
  mongoose.models.doctor || mongoose.model("doctor", doctorSchema);

export default doctorModel;
