import express from 'express'
import { addDoctor, loginAdmin, adminDashboard, allDoctors, getDoctorById, deleteDoctor, appointmentsAdmin, getAppointmentById, cancelAppointment } from '../controllers/adminController.js'
import upload from '../middlewares/multer.js'
import authAdmin from '../middlewares/authAdmin.js'
import { changeAvailability } from '../controllers/doctorController.js'

const adminRouter = express.Router()

// Auth
adminRouter.post('/auth/login', loginAdmin)

// Doctors (admin-managed)
adminRouter.post('/doctors', authAdmin, upload.single('image'), addDoctor)
adminRouter.get('/doctors', authAdmin, allDoctors)
adminRouter.get('/doctors/:id', authAdmin, getDoctorById)
adminRouter.patch('/doctors/:id/availability', authAdmin, changeAvailability)
adminRouter.delete('/doctors/:id', authAdmin, deleteDoctor)

// Appointments
adminRouter.get('/appointments', authAdmin, appointmentsAdmin)
adminRouter.get('/appointments/:id', authAdmin, getAppointmentById)
adminRouter.patch('/appointments/:id/cancel', authAdmin, cancelAppointment)

// Dashboard
adminRouter.get('/dashboard', authAdmin, adminDashboard)

export default adminRouter;
