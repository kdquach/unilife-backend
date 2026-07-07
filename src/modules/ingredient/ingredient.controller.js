const asyncHandler = require("../../utils/asyncHandler");
const { success, fail } = require("../../utils/apiResponse");
const service = require("./ingredient.service");

const create = asyncHandler(async (req, res) =>
  success(res, await service.create(req.body), "Created successfully", 201),
);
const list = asyncHandler(async (req, res) =>
  success(res, await service.list(req.query), "Get list successfully"),
);
const search = asyncHandler(async (req, res) =>
  success(
    res,
    await service.search(req.query),
    "Search ingredients successfully",
  ),
);
const filter = asyncHandler(async (req, res) =>
  success(
    res,
    await service.filter(req.query),
    "Filter ingredients successfully",
  ),
);
const adjustStock = asyncHandler(async (req, res) =>
  success(
    res,
    await service.adjustStock(req.params.id, req.body, req.user),
    "Adjust ingredient stock successfully",
  ),
);
const recordStockImport = asyncHandler(async (req, res) =>
  success(
    res,
    await service.recordStockImport(req.params.id, req.body, req.user),
    "Record stock import successfully",
    201,
  ),
);
const getById = asyncHandler(async (req, res) => {
  const item = await service.getById(req.params.id);
  if (!item) return fail(res, "Ingredient not found", 404);

  return success(res, item, "Get detail successfully");
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
  search,
  filter,
  adjustStock,
  recordStockImport,
  getById,
  updateById,
  deleteById,
};
