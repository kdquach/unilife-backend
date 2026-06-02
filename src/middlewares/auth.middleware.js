const { verifyAccessToken } = require("../utils/jwt.util");
const User = require("../modules/user/user.model");

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token)
      return res
        .status(401)
        .json({ success: false, message: "Access token is required" });

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.userId).select("-passwordHash");
    if (!user || !user.isActive)
      return res
        .status(401)
        .json({ success: false, message: "Invalid or disabled account" });

    req.user = user;
    req.tokenPayload = decoded;
    next();
  } catch (error) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired access token" });
  }
};

module.exports = { authenticate };
