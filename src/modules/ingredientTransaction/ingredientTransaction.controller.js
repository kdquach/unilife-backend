const asyncHandler = require("../../utils/asyncHandler");
const { success, fail } = require("../../utils/apiResponse");
const service = require("./ingredientTransaction.service");

const create = asyncHandler(async (req, res) =>
  success(res, await service.create(req.body), "Created successfully", 201),
);
const list = asyncHandler(async (req, res) =>
  success(
    res,
    await service.list(req.query),
    "Get inventory transaction history successfully",
  ),
);
const getById = asyncHandler(async (req, res) => {
  const item = await service.getById(req.params.id);
  if (!item) return fail(res, "Ingredient transaction not found", 404);

  return success(res, item, "Get inventory transaction detail successfully");
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

module.exports = { create, list, getById, updateById, deleteById };
