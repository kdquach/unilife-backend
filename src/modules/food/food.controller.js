const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/apiResponse");
const service = require("./food.service");

const create = asyncHandler(async (req, res) =>
  success(res, await service.create(req.body), "Created successfully", 201),
);
const list = asyncHandler(async (req, res) =>
  success(res, await service.list(req.query), "Get list successfully"),
);
const search = asyncHandler(async (req, res) =>
  success(res, await service.search(req.query), "Search foods successfully"),
);
const filter = asyncHandler(async (req, res) =>
  success(res, await service.filter(req.query), "Filter foods successfully"),
);
const getFilterOptions = asyncHandler(async (req, res) =>
  success(
    res,
    await service.getFilterOptions(req.query),
    "Get food filter options successfully",
  ),
);
const getById = asyncHandler(async (req, res) =>
  success(res, await service.getById(req.params.id), "Get detail successfully"),
);
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
  getFilterOptions,
  getById,
  updateById,
  deleteById,
};
