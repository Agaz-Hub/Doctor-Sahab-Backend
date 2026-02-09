import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import connectDB from './config/mongodb.js';
import connectCloudinary from './config/cloudinary.js';
import adminRouter from './routes/adminRouter.js';
import doctorRouter from './routes/doctorRouter.js';
import userRouter from './routes/userRouter.js';

// App config
const app = express();
const port = process.env.PORT || 4000;
connectDB();
connectCloudinary();

// middelwares
app.use(express.json());
app.use(cors());

// API endpoints
app.use("/api/admin", adminRouter)
app.use("/api/doctor", doctorRouter)
app.use("/api/user", userRouter)


app.get("/", (req, res) => {
    res.send("API Working...");
})

app.listen(port, () => {console.log("server started", port)});