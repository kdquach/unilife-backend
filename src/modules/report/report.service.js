const Order = require("../order/order.model");

const getRevenueReport = async (query = {}) => {

  const match = {
    paymentStatus: "PAID",
    status: { $ne: "CANCELLED" },
  };

  // from / to
  if (query.from || query.to) {

    match.createdAt = {};

    if (query.from) {
      match.createdAt.$gte = new Date(query.from);
    }

    if (query.to) {
      const end = new Date(query.to);
      end.setHours(23, 59, 59, 999);
      match.createdAt.$lte = end;
    }
  }

  //----------------------------------------
  // group by
  //----------------------------------------

  let groupId;

  switch (query.type) {

    case "monthly":

      groupId = {
        $dateToString: {
          format: "%Y-%m",
          date: "$createdAt",
        },
      };

      break;

    case "yearly":

      groupId = {
        $dateToString: {
          format: "%Y",
          date: "$createdAt",
        },
      };

      break;

    default:

      groupId = {
        $dateToString: {
          format: "%Y-%m-%d",
          date: "$createdAt",
        },
      };
  }

  //----------------------------------------
  // Summary
  //----------------------------------------

  const summary = await Order.aggregate([
    {
      $match: match,
    },
    {
      $group: {
        _id: null,
        totalRevenue: {
          $sum: "$totalPrice",
        },
        totalOrders: {
          $sum: 1,
        },
      },
    },
  ]);

  //----------------------------------------
  // Revenue chart
  //----------------------------------------

  const revenue = await Order.aggregate([
    {
      $match: match,
    },
    {
      $group: {
        _id: groupId,
        revenue: {
          $sum: "$totalPrice",
        },
        orders: {
          $sum: 1,
        },
      },
    },
    {
      $sort: {
        _id: 1,
      },
    },
  ]);

  const totalRevenue = summary.length
    ? summary[0].totalRevenue
    : 0;

  const totalOrders = summary.length
    ? summary[0].totalOrders
    : 0;

  return {

    summary: {

      totalRevenue,

      totalOrders,

      averageOrderValue:
        totalOrders === 0
          ? 0
          : Math.round(totalRevenue / totalOrders),
    },

    revenue,
  };
};

module.exports = {
  getRevenueReport,
};