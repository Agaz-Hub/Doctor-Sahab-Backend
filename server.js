import express from "express";
import cors from "cors";
import "dotenv/config";
import connectDB from "./config/mongodb.js";
import connectCloudinary from "./config/cloudinary.js";
import adminRouter from "./routes/adminRouter.js";
import doctorRouter from "./routes/doctorRouter.js";
import userRouter from "./routes/userRouter.js";
import aiRouter from "./routes/aiRouter.js";
import doctorCompatRouter from "./routes/doctorCompatRouter.js";
import doctorAiRouter from "./routes/doctorAiRouter.js";

// App config
const app = express();
const port = process.env.PORT || 4000;
connectDB();
connectCloudinary();

// Middlewares
app.use(express.json());
app.use(cors());

// API endpoints
app.use("/api/admin", adminRouter);
app.use("/api/doctors", doctorRouter);
app.use("/api/doctor", doctorCompatRouter);
app.use("/api/users", userRouter);
app.use("/api/ai", aiRouter);
app.use("/api/doctor-ai", doctorAiRouter);

app.get("/", (req, res) => {
  res.send("API Working...");
});

app.listen(port, () => {
  console.log("server started", port);
});
