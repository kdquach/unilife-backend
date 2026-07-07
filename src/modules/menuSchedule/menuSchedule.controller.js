const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/apiResponse");
const service = require("./menuSchedule.service");

const create = asyncHandler(async (req, res) =>
  success(res, await service.create(req.body), "Created successfully", 201),
);
const list = asyncHandler(async (req, res) =>
  success(res, await service.list(req.query), "Get list successfully"),
);
// Get menu schedule list specifically for staff (supports inactive filtering)
const listMenuScheduleForStaff = asyncHandler(async (req, res) =>
  success(res, await service.listMenuScheduleForStaff(req.query), "Get menu schedule list for staff successfully"),
);

// Get specific menu schedule detail for staff by ID
const getMenuScheduleByIdForStaff = asyncHandler(async (req, res) =>
  success(res, await service.getMenuScheduleByIdForStaff(req.params.id, req.query), "Get menu schedule detail for staff successfully"),
);
const getToday = asyncHandler(async (req, res) =>
  success(res, await service.getToday(), "Get today menu successfully"),
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

module.exports = { create, list, getToday, getById, updateById, deleteById, listMenuScheduleForStaff, getMenuScheduleByIdForStaff };

