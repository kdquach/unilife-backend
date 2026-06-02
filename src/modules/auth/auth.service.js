const crypto = require("crypto");
const User = require("../user/user.model");
const Session = require("../session/session.model");
const OTP = require("../otp/otp.model");
const { hashPassword, comparePassword } = require("../../utils/password.util");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("../../utils/jwt.util");
const { generateOtp, addMinutes } = require("../../utils/otp.util");
const { sendForgotPasswordOtp } = require("../../utils/email.util");
const ROLES = require("../../constants/roles.constant");

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const toSafeUser = (user) => ({
  id: user._id,
  userId: user._id,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  avatarUrl: user.avatarUrl,
  isActive: user.isActive,
});

const buildAuthPayload = async (user, req, rememberMe = false) => {
  const payload = { userId: user._id.toString(), role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await Session.create({
    userId: user._id,
    token: hashToken(refreshToken),
    expiresAt: rememberMe ? daysFromNow(30) : daysFromNow(7),
    isRevoked: false,
  });

  return { accessToken, refreshToken, user: toSafeUser(user) };
};

const register = async (data, req) => {
  const existing = await User.findOne({ email: data.email });
  if (existing) {
    const err = new Error("Email already exists");
    err.statusCode = 409;
    throw err;
  }

  const user = await User.create({
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    passwordHash: await hashPassword(data.password),
    role: data.role || ROLES.CUSTOMER,
    avatarUrl: data.avatarUrl || null,
    isActive: true,
  });

  return buildAuthPayload(user, req, data.rememberMe);
};

const login = async ({ email, password, rememberMe }, req) => {
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user) {
    const err = new Error("Incorrect email or password");
    err.statusCode = 401;
    throw err;
  }
  if (!user.isActive) {
    const err = new Error(
      "Your account has been disabled. Please contact Admin for support.",
    );
    err.statusCode = 403;
    throw err;
  }

  const matched = await comparePassword(password, user.passwordHash);
  if (!matched) {
    const err = new Error("Incorrect email or password");
    err.statusCode = 401;
    throw err;
  }

  return buildAuthPayload(user, req, rememberMe);
};

const refresh = async ({ refreshToken }, req) => {
  const decoded = verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);
  const session = await Session.findOne({
    userId: decoded.userId,
    token: tokenHash,
    isRevoked: false,
    expiresAt: { $gt: new Date() },
  });
  if (!session) {
    const err = new Error("Invalid refresh token");
    err.statusCode = 401;
    throw err;
  }

  const user = await User.findById(decoded.userId);
  if (!user || !user.isActive) {
    const err = new Error("Invalid account");
    err.statusCode = 401;
    throw err;
  }

  session.isRevoked = true;
  await session.save();
  return buildAuthPayload(user, req, true);
};

const logout = async (userId) => {
  await Session.updateMany({ userId, isRevoked: false }, { isRevoked: true });
  return true;
};

const requestForgotPasswordOtp = async ({ email }) => {
  const user = await User.findOne({ email });
  if (!user) return true;

  const otp = generateOtp();
  await OTP.create({
    userId: user._id,
    code: await hashPassword(otp),
    purpose: "FORGOT_PASSWORD",
    isUsed: false,
    expiresAt: addMinutes(10),
  });

  await sendForgotPasswordOtp(user.email, otp);
  return true;
};

const resetPassword = async ({ email, otp, newPassword }) => {
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user) {
    const err = new Error("Invalid OTP or email");
    err.statusCode = 400;
    throw err;
  }

  const otpDocs = await OTP.find({
    userId: user._id,
    purpose: "FORGOT_PASSWORD",
    isUsed: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
  let matchedOtp = null;
  for (const doc of otpDocs) {
    if (await comparePassword(otp, doc.code)) {
      matchedOtp = doc;
      break;
    }
  }

  if (!matchedOtp) {
    const err = new Error("Invalid or expired OTP");
    err.statusCode = 400;
    throw err;
  }

  matchedOtp.isUsed = true;
  await matchedOtp.save();
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await Session.updateMany(
    { userId: user._id, isRevoked: false },
    { isRevoked: true },
  );
  return true;
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId).select("+passwordHash");
  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  const matched = await comparePassword(currentPassword, user.passwordHash);
  if (!matched) {
    const err = new Error("Current password is incorrect");
    err.statusCode = 400;
    throw err;
  }

  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await Session.updateMany(
    { userId: user._id, isRevoked: false },
    { isRevoked: true },
  );
  return true;
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  requestForgotPasswordOtp,
  resetPassword,
  changePassword,
};
