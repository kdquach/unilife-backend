const express = require("express");
const controller = require("./auth.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const rateLimit = require("express-rate-limit");
const { validate } = require("../../middlewares/validate.middleware");
const { registerSchema, resetPasswordSchema } = require("./auth.validation");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many authentication attempts, please try again after 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === "test",
});

router.post(
  "/register",
  authLimiter,
  validate(registerSchema),
  controller.register
);
router.post("/verify-register-otp", controller.verifyRegisterOtp);
router.post("/resend-register-otp", authLimiter, controller.resendRegisterOtp);
router.post("/login", authLimiter, controller.login);
router.post("/refresh-token", controller.refresh);
router.post("/forgot-password", authLimiter, controller.forgotPassword);
router.post("/resend-forgot-password-otp", authLimiter, controller.resendForgotPasswordOtp);
router.post("/reset-password", authLimiter, validate(resetPasswordSchema), controller.resetPassword);
router.post("/logout", authenticate, controller.logout);
router.patch("/change-password", authenticate, controller.changePassword);
router.get("/me", authenticate, controller.me);

module.exports = router;
