# Doctor Sahab Backend

A comprehensive REST API backend for a doctor appointment booking system built with Node.js, Express, and MongoDB.

## Features

- **User Management**: User registration, login, and profile management
- **Doctor Management**: Admin can add doctors, manage availability
- **Appointment System**: Book, view, and cancel appointments
- **Video Call Support**: Integrated video call functionality with room IDs
- **Authentication**: JWT-based authentication for users, doctors, and admins
- **Image Upload**: Cloudinary integration for profile and doctor images
- **SMS Notifications**: Twilio integration for notifications

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js 5.x
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JSON Web Tokens (JWT)
- **Password Hashing**: bcrypt
- **File Upload**: Multer
- **Cloud Storage**: Cloudinary
- **SMS Service**: Twilio
- **Validation**: validator.js

## Prerequisites

- Node.js (v18 or higher recommended)
- MongoDB database
- Cloudinary account
- Twilio account (for SMS features)

## Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/doctor-sahab-backend.git
   cd doctor-sahab-backend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   Create a `.env` file in the root directory (see `.env.example` for reference):

   ```env
   PORT=4000
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret_key
   CLOUDINARY_NAME=your_cloudinary_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_SECRET_KEY=your_cloudinary_secret_key
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=your_admin_password
   TWILIO_ACCOUNT_SID=your_twilio_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   ```

4. **Start the server**

   ```bash
   # Development mode with auto-reload
   npm run server

   # Production mode
   npm start
   ```

## API Endpoints

### User Routes (`/api/user`)

| Method | Endpoint              | Description            | Auth Required |
| ------ | --------------------- | ---------------------- | ------------- |
| POST   | `/register`           | Register a new user    | No            |
| POST   | `/login`              | User login             | No            |
| GET    | `/get-profile`        | Get user profile       | Yes           |
| POST   | `/update-profile`     | Update user profile    | Yes           |
| POST   | `/book-appointment`   | Book an appointment    | Yes           |
| GET    | `/appointments`       | List user appointments | Yes           |
| POST   | `/cancel-appointment` | Cancel an appointment  | Yes           |

### Doctor Routes (`/api/doctor`)

| Method | Endpoint                | Description               | Auth Required |
| ------ | ----------------------- | ------------------------- | ------------- |
| POST   | `/login`                | Doctor login              | No            |
| GET    | `/list`                 | Get all doctors           | No            |
| POST   | `/change-availability`  | Toggle availability       | Yes (Doctor)  |
| GET    | `/appointments`         | Get doctor appointments   | Yes (Doctor)  |
| POST   | `/complete-appointment` | Mark appointment complete | Yes (Doctor)  |
| POST   | `/cancel-appointment`   | Cancel appointment        | Yes (Doctor)  |
| GET    | `/dashboard`            | Get dashboard stats       | Yes (Doctor)  |

### Admin Routes (`/api/admin`)

| Method | Endpoint              | Description            | Auth Required |
| ------ | --------------------- | ---------------------- | ------------- |
| POST   | `/login`              | Admin login            | No            |
| POST   | `/add-doctor`         | Add a new doctor       | Yes (Admin)   |
| GET    | `/all-doctors`        | Get all doctors        | Yes (Admin)   |
| GET    | `/appointments`       | Get all appointments   | Yes (Admin)   |
| POST   | `/cancel-appointment` | Cancel any appointment | Yes (Admin)   |

## Project Structure

```
Doctor-Sahab-Backend/
├── config/
│   ├── cloudinary.js      # Cloudinary configuration
│   └── mongodb.js         # MongoDB connection
├── controllers/
│   ├── adminController.js # Admin business logic
│   ├── doctorController.js # Doctor business logic
│   └── userController.js  # User business logic
├── middlewares/
│   ├── authAdmin.js       # Admin authentication
│   ├── authDoctor.js      # Doctor authentication
│   ├── authUser.js        # User authentication
│   └── multer.js          # File upload configuration
├── models/
│   ├── appointmentModel.js # Appointment schema
│   ├── doctorModel.js      # Doctor schema
│   └── userModel.js        # User schema
├── routes/
│   ├── adminRouter.js     # Admin routes
│   ├── doctorRouter.js    # Doctor routes
│   └── userRouter.js      # User routes
├── uploads/               # Temporary upload directory
├── .env                   # Environment variables (not in repo)
├── .env.example           # Environment template
├── .gitignore             # Git ignore rules
├── package.json           # Dependencies and scripts
├── README.md              # Project documentation
└── server.js              # Application entry point
```

## Data Models

### User

- `name`, `email`, `password`
- `image`, `address`, `gender`, `dob`, `phone`

### Doctor

- `name`, `email`, `password`, `image`
- `speciality`, `degree`, `experience`, `about`
- `available`, `fees`, `address`
- `slots_booked` (for managing appointment slots)

### Appointment

- `userId`, `docId`, `slotDate`, `slotTime`
- `userData`, `docData`, `amount`
- `cancelled`, `iscompleted`

## Scripts

```bash
npm start     # Start production server
npm run server # Start development server with nodemon
npm test       # Run tests
```

## Error Handling

The API returns consistent JSON responses:

```json
// Success
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}

// Error
{
  "success": false,
  "message": "Error description"
}
```

## Security Features

- Password hashing with bcrypt (salt rounds: 9-10)
- JWT token-based authentication
- Input validation using validator.js
- Role-based access control (User, Doctor, Admin)

## Contributing

Contributions are welcome! Please read the [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## Author

Doctor Sahab Team

---

Made with ❤️ for better healthcare accessibility
