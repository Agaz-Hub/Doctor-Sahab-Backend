import jwt from "jsonwebtoken";

const authDoctor = (req, res, next) => {
  try {
    const headerToken = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : "";
    const dToken = req.headers.dtoken || headerToken;

    if (!dToken) {
      console.log("❌ No token in headers");
      return res.json({
        success: false,
        message: "Not authorized, login again",
      });
    }

    const token_decode = jwt.verify(dToken, process.env.JWT_SECRET);
    req.docId = token_decode.id;
    console.log("✅ Decoded token:", token_decode);
    next();
  } catch (error) {
    console.log("authDoctor error:", error);
    res.json({ success: false, message: error.message });
  }
};

export default authDoctor;
