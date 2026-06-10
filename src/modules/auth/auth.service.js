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
const {
  sendForgotPasswordOtp,
  sendRegistrationOtp,
} = require("../../utils/email.util");
const ROLES = require("../../constants/roles.constant");

const OTP_PURPOSES = Object.freeze({
  REGISTER: "REGISTER",
  FORGOT_PASSWORD: "FORGOT_PASSWORD",
});

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const toSafeUser = (user) => ({
  id: user._id,
  userId: user._id,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  avatarUrl: user.avatarUrl,
  isActive: user.isActive,
  isEmailVerified: user.isEmailVerified !== false,
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

const findValidOtp = async (userId, purpose, otp) => {
  const otpDocs = await OTP.find({
    userId,
    purpose,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  for (const doc of otpDocs) {
    if (await comparePassword(otp, doc.code)) return doc;
  }

  return null;
};

const issueRegistrationOtp = async (user) => {
  await OTP.updateMany(
    {
      userId: user._id,
      purpose: OTP_PURPOSES.REGISTER,
      isUsed: false,
    },
    { isUsed: true },
  );

  const otp = generateOtp();
  const expiresAt = addMinutes(10);
  await OTP.create({
    userId: user._id,
    code: await hashPassword(otp),
    purpose: OTP_PURPOSES.REGISTER,
    isUsed: false,
    expiresAt,
  });

  await sendRegistrationOtp(user.email, otp);
  return expiresAt;
};

const issueForgotPasswordOtp = async (user) => {
  await OTP.updateMany(
    {
      userId: user._id,
      purpose: OTP_PURPOSES.FORGOT_PASSWORD,
      isUsed: false,
    },
    { isUsed: true },
  );

  const otp = generateOtp();
  const expiresAt = addMinutes(10);
  await OTP.create({
    userId: user._id,
    code: await hashPassword(otp),
    purpose: OTP_PURPOSES.FORGOT_PASSWORD,
    isUsed: false,
    expiresAt,
  });

  await sendForgotPasswordOtp(user.email, otp);
  return expiresAt;
};

const register = async (data) => {
  const email = normalizeEmail(data.email);
  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.isEmailVerified === false) {
      existing.fullName = data.fullName;
      existing.phone = data.phone;
      existing.passwordHash = await hashPassword(data.password);
      existing.role = ROLES.CUSTOMER;
      existing.avatarUrl = data.avatarUrl || null;
      existing.isActive = true;
      await existing.save();

      const otpExpiresAt = await issueRegistrationOtp(existing);
      return { user: toSafeUser(existing), otpExpiresAt };
    }

    const err = new Error("Email already exists");
    err.statusCode = 409;
    throw err;
  }

  const user = await User.create({
    fullName: data.fullName,
    email,
    phone: data.phone,
    passwordHash: await hashPassword(data.password),
    role: ROLES.CUSTOMER,
    avatarUrl: data.avatarUrl || null,
    isActive: true,
    isEmailVerified: false,
  });

  const otpExpiresAt = await issueRegistrationOtp(user);
  return { user: toSafeUser(user), otpExpiresAt };
};

const verifyRegisterOtp = async ({ email, otp, rememberMe }, req) => {
  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user) {
    const err = new Error("Invalid OTP or email");
    err.statusCode = 400;
    throw err;
  }
  if (user.isEmailVerified !== false) {
    const err = new Error("Email is already verified");
    err.statusCode = 409;
    throw err;
  }

  const matchedOtp = await findValidOtp(user._id, OTP_PURPOSES.REGISTER, otp);
  if (!matchedOtp) {
    const err = new Error("Invalid or expired OTP");
    err.statusCode = 400;
    throw err;
  }

  matchedOtp.isUsed = true;
  await matchedOtp.save();
  user.isEmailVerified = true;
  await user.save();

  return buildAuthPayload(user, req, rememberMe);
};

const resendRegisterOtp = async ({ email }) => {
  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user || user.isEmailVerified !== false) return true;

  await issueRegistrationOtp(user);
  return true;
};

const login = async ({ email, password, rememberMe }, req) => {
  const user = await User.findOne({ email: normalizeEmail(email) }).select(
    "+passwordHash",
  );
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
  if (user.isEmailVerified === false) {
    const err = new Error("Please verify your email before logging in.");
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
  if (!user || !user.isActive || user.isEmailVerified === false) {
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
  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user || !user.isActive || user.isEmailVerified === false) return true;

  await issueForgotPasswordOtp(user);
  return true;
};

const resendForgotPasswordOtp = async ({ email }) => {
  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user || !user.isActive || user.isEmailVerified === false) return true;

  await issueForgotPasswordOtp(user);
  return true;
};

const resetPassword = async ({ email, otp, newPassword }) => {
  const user = await User.findOne({ email: normalizeEmail(email) }).select(
    "+passwordHash",
  );
  if (!user) {
    const err = new Error("Invalid OTP or email");
    err.statusCode = 400;
    throw err;
  }

  const matchedOtp = await findValidOtp(
    user._id,
    OTP_PURPOSES.FORGOT_PASSWORD,
    otp,
  );
  if (!matchedOtp) {
    const err = new Error("Invalid or expired OTP");
    err.statusCode = 400;
    throw err;
  }

  matchedOtp.isUsed = true;
  await matchedOtp.save();
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await OTP.updateMany(
    {
      userId: user._id,
      purpose: OTP_PURPOSES.FORGOT_PASSWORD,
      isUsed: false,
    },
    { isUsed: true },
  );
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
  verifyRegisterOtp,
  resendRegisterOtp,
  login,
  refresh,
  logout,
  requestForgotPasswordOtp,
  resendForgotPasswordOtp,
  resetPassword,
  changePassword,
  toSafeUser,
};
