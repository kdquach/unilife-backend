const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/apiResponse");
const authService = require("./auth.service");

const register = asyncHandler(async (req, res) =>
  success(
    res,
    await authService.register(req.body, req),
    "Register successfully",
    201,
  ),
);
const login = asyncHandler(async (req, res) =>
  success(res, await authService.login(req.body, req), "Login successfully"),
);
const refresh = asyncHandler(async (req, res) =>
  success(
    res,
    await authService.refresh(req.body, req),
    "Refresh token successfully",
  ),
);
const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user._id);
  return success(res, null, "Logout successfully");
});
const forgotPassword = asyncHandler(async (req, res) => {
  await authService.requestForgotPasswordOtp(req.body);
  return success(res, null, "If the email exists, OTP has been sent");
});
const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body);
  return success(res, null, "Password reset successfully");
});
const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user._id, req.body);
  return success(res, null, "Password changed successfully");
});
const me = asyncHandler(async (req, res) =>
  success(res, req.user, "Get profile successfully"),
);

module.exports = {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  me,
};
