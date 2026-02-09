import multer from "multer";

// Use memory storage - files stored in RAM as Buffer
const storage = multer.memoryStorage();

const upload = multer({ storage });

export default upload;
