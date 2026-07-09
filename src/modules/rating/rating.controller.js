const asyncHandler = require("../../utils/asyncHandler");
const { success, fail } = require("../../utils/apiResponse");
const service = require("./rating.service");

const create = asyncHandler(async (req, res) =>
  success(
    res,
    await service.create(req.user._id, req.body),
    "Created successfully",
    201,
  ),
);
const list = asyncHandler(async (req, res) =>
  success(res, await service.list(req.query), "Get list successfully"),
);
const listMine = asyncHandler(async (req, res) =>
  success(
    res,
    await service.listMine(req.user._id, req.query),
    "Get my ratings successfully",
  ),
);
const getById = asyncHandler(async (req, res) => {
  const item = await service.getById(req.params.id);
  if (!item) return fail(res, "Rating not found", 404);

  return success(res, item, "Get detail successfully");
});
const getMineById = asyncHandler(async (req, res) => {
  const item = await service.getMineById(req.user._id, req.params.id);
  if (!item) return fail(res, "Rating not found", 404);

  return success(res, item, "Get my rating detail successfully");
});
const updateById = asyncHandler(async (req, res) =>
  success(
    res,
    await service.updateMineById(req.user._id, req.params.id, req.body),
    "Updated successfully",
  ),
);
const deleteById = asyncHandler(async (req, res) =>
  success(
    res,
    await service.deleteMineById(req.user._id, req.params.id),
    "Deleted successfully",
  ),
);

module.exports = {
  create,
  list,
  listMine,
  getById,
  getMineById,
  updateById,
  deleteById,
};
