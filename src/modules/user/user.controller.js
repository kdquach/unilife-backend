const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/apiResponse");
const service = require("./user.service");

const getProfile = asyncHandler(async (req, res) =>
  success(
    res,
    await service.getProfile(req.user._id),
    "Get profile successfully",
  ),
);
const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, phone } = req.body;

  if (fullName !== undefined) {
    if (typeof fullName !== "string" || fullName.trim() === "") {
      const err = new Error("Full name cannot be empty");
      err.statusCode = 400;
      throw err;
    }
  }

  if (phone !== undefined && phone !== null) {
    if (typeof phone !== "string" || !/^[0-9]{9,15}$/.test(phone)) {
      const err = new Error("Invalid phone number format");
      err.statusCode = 400;
      throw err;
    }
  }

  return success(
    res,
    await service.updateProfile(req.user._id, req.body),
    "Profile updated successfully",
  );
});
const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    const err = new Error("Avatar file is required");
    err.statusCode = 400;
    throw err;
  }
  return success(
    res,
    await service.uploadAvatar(req.user._id, req.file),
    "Avatar uploaded successfully",
  );
});
const listUsers = asyncHandler(async (req, res) =>
  success(res, await service.listUsers(req.query), "Get users successfully"),
);
const updateUserStatus = asyncHandler(async (req, res) =>
  success(
    res,
    await service.updateUserStatus(req.params.id, req.body.isActive),
    "User status updated successfully",
  ),
);
const updateUserRole = asyncHandler(async (req, res) =>
  success(
    res,
    await service.updateUserRole(req.params.id, req.body.role),
    "User role updated successfully",
  ),
);

module.exports = {
  getProfile,
  updateProfile,
  uploadAvatar,
  listUsers,
  updateUserStatus,
  updateUserRole,
};
