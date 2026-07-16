const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/apiResponse");
const service = require("./report.service");

const getRevenueReport = asyncHandler(async (req, res) => {
  const data = await service.getRevenueReport(req.query);

  return success(
    res,
    data,
    "Revenue report retrieved successfully",
  );
});

const getPeakHourReport = asyncHandler(async (req, res) => {
  const result = await service.getPeakHourReport(req.query);

  return success(
    res,
    result,
    "Peak hour report retrieved successfully"
  );
});

const getOrderStatistics = asyncHandler(async (req, res) => {
  const result = await service.getOrderStatistics(req.query);

  return success(
    res,
    result,
    "Order statistics retrieved successfully"
  );
});


const getPopularFoodReport = asyncHandler(async (req, res) => {
  const result = await service.getPopularFoodReport(req.query);

  return success(
    res,
    result,
    "Popular food report retrieved successfully"
  );
});

module.exports = {
  getRevenueReport,
  getPeakHourReport,
  getOrderStatistics,
  getPopularFoodReport,
};