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
const updateProfile = asyncHandler(async (req, res) =>
  success(
    res,
    await service.updateProfile(req.user._id, req.body),
    "Profile updated successfully",
  ),
);
const uploadAvatar = asyncHandler(async (req, res) =>
  success(
    res,
    await service.uploadAvatar(req.user._id, req.file),
    "Avatar uploaded successfully",
  ),
);
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
