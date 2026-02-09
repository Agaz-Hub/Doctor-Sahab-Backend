import jwt from "jsonwebtoken";

const authUser = (req, res, next) => {
    try {
        const {token} = req.headers
        if (!token) {
            return res.json({success: false, message: "Not authorized, login again"});
        }

        const token_decode = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = token_decode.id;
        next();
    } catch (error) {
        res.json({success: false, message: error.message});
    }
}

export default authUser;