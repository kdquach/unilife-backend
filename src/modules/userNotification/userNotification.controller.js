const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/apiResponse");
const service = require("./userNotification.service");

const create = asyncHandler(async (req, res) =>
  success(res, await service.create(req.body), "Created successfully", 201),
);
const list = asyncHandler(async (req, res) =>
  success(res, await service.list(req.query), "Get list successfully"),
);
const loginWelcome = asyncHandler(async (req, res) =>
  success(
    res,
    service.getLoginWelcome(req.user),
    "Get login welcome notification successfully",
  ),
);
const listMine = asyncHandler(async (req, res) =>
  success(
    res,
    await service.listMine(req.user._id, req.query),
    "Get my notifications successfully",
  ),
);
const getById = asyncHandler(async (req, res) =>
  success(res, await service.getById(req.params.id), "Get detail successfully"),
);
const getMineById = asyncHandler(async (req, res) => {
  const item = await service.getMineById(req.user._id, req.params.id, req.query);
  if (!item) {
    return res
      .status(404)
      .json({ success: false, message: "Notification not found" });
  }

  return success(res, item, "Get my notification detail successfully");
});
const updateById = asyncHandler(async (req, res) =>
  success(
    res,
    await service.updateById(req.params.id, req.body),
    "Updated successfully",
  ),
);
const deleteById = asyncHandler(async (req, res) =>
  success(res, await service.deleteById(req.params.id), "Deleted successfully"),
);

module.exports = {
  create,
  list,
  loginWelcome,
  listMine,
  getById,
  getMineById,
  updateById,
  deleteById,
};
