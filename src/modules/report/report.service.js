const Order = require("../order/order.model");
const OrderItem = require("../orderItem/orderItem.model");
const Food = require("../food/food.model");

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

  const totalRevenue = summary.length ? summary[0].totalRevenue : 0;

  const totalOrders = summary.length ? summary[0].totalOrders : 0;

  return {
    summary: {
      totalRevenue,

      totalOrders,

      averageOrderValue:
        totalOrders === 0 ? 0 : Math.round(totalRevenue / totalOrders),
    },

    revenue,
  };
};

const getPeakHourReport = async (query = {}) => {
  const type = query.type || "yearly";

  const match = {
    paymentStatus: "PAID",
    status: { $ne: "CANCELLED" },
  };

  //----------------------------------------
  // Daily
  //----------------------------------------

  if (type === "daily") {
    if (!query.month || !query.year) {
      const err = new Error("Month and year are required.");
      err.statusCode = 400;
      throw err;
    }

    match.createdAt = {
      $gte: new Date(Number(query.year), Number(query.month) - 1, 1),
      $lte: new Date(
        Number(query.year),
        Number(query.month),
        0,
        23,
        59,
        59,
        999
      ),
    };
  }

  //----------------------------------------
  // Monthly
  //----------------------------------------

  else if (type === "monthly") {
    if (!query.year) {
      const err = new Error("Year is required.");
      err.statusCode = 400;
      throw err;
    }

    match.createdAt = {
      $gte: new Date(Number(query.year), 0, 1),
      $lte: new Date(
        Number(query.year),
        11,
        31,
        23,
        59,
        59,
        999
      ),
    };
  }

  //----------------------------------------
  // From / To
  //----------------------------------------

  if (query.from || query.to) {
    match.createdAt = match.createdAt || {};

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
  // Peak hours
  //----------------------------------------

  const peakHours = await Order.aggregate([
    {
      $match: match,
    },
    {
      $group: {
        _id: {
          hour: {
            $hour: "$createdAt",
          },
        },
        orders: {
          $sum: 1,
        },
        revenue: {
          $sum: "$totalPrice",
        },
      },
    },
    {
      $project: {
        _id: 0,
        hour: "$_id.hour",
        orders: 1,
        revenue: 1,
      },
    },
    {
      $sort: {
        hour: 1,
      },
    },
  ]);

  //----------------------------------------
  // Summary
  //----------------------------------------

  const peakHour =
    peakHours.length > 0
      ? peakHours.reduce((max, item) =>
          item.orders > max.orders ? item : max
        )
      : null;

  return {
    summary: {
      peakHour: peakHour?.hour ?? null,
      maxOrders: peakHour?.orders ?? 0,
      revenueAtPeakHour: peakHour?.revenue ?? 0,
    },

    peakHours,
  };
};

const getOrderStatistics = async (query = {}) => {
  const type = query.type || "yearly";

  const match = {};

  //----------------------------------------
  // Daily
  //----------------------------------------

  if (type === "daily") {
    if (!query.month || !query.year) {
      const err = new Error("Month and year are required.");
      err.statusCode = 400;
      throw err;
    }

    match.createdAt = {
      $gte: new Date(Number(query.year), Number(query.month) - 1, 1),
      $lte: new Date(
        Number(query.year),
        Number(query.month),
        0,
        23,
        59,
        59,
        999
      ),
    };
  }

  //----------------------------------------
  // Monthly
  //----------------------------------------

  else if (type === "monthly") {
    if (!query.year) {
      const err = new Error("Year is required.");
      err.statusCode = 400;
      throw err;
    }

    match.createdAt = {
      $gte: new Date(Number(query.year), 0, 1),
      $lte: new Date(
        Number(query.year),
        11,
        31,
        23,
        59,
        59,
        999
      ),
    };
  }

  //----------------------------------------
  // From / To
  //----------------------------------------

  if (query.from || query.to) {
    match.createdAt = match.createdAt || {};

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
  // Summary
  //----------------------------------------

  const summary = await Order.aggregate([
    {
      $match: match,
    },
    {
      $group: {
        _id: null,

        totalOrders: { $sum: 1 },

        pending: {
          $sum: {
            $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0],
          },
        },

        preparing: {
          $sum: {
            $cond: [{ $eq: ["$status", "PREPARING"] }, 1, 0],
          },
        },

        ready: {
          $sum: {
            $cond: [{ $eq: ["$status", "READY"] }, 1, 0],
          },
        },

        completed: {
          $sum: {
            $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0],
          },
        },

        cancelled: {
          $sum: {
            $cond: [{ $eq: ["$status", "CANCELLED"] }, 1, 0],
          },
        },
      },
    },
  ]);

  //----------------------------------------
  // Order Status Distribution
  //----------------------------------------

  const statistics = await Order.aggregate([
    {
      $match: match,
    },
    {
      $group: {
        _id: "$status",
        orders: {
          $sum: 1,
        },
      },
    },
    {
      $sort: {
        orders: -1,
      },
    },
  ]);

  //----------------------------------------
  // Percentage
  //----------------------------------------

  const totalOrders = summary[0]?.totalOrders || 0;

  const statisticsWithPercentage = statistics.map((item) => ({
    status: item._id,
    orders: item.orders,
    percentage:
      totalOrders === 0
        ? 0
        : Number(((item.orders / totalOrders) * 100).toFixed(2)),
  }));

  //----------------------------------------
  // Return
  //----------------------------------------

  return {
    summary: summary[0] || {
      totalOrders: 0,
      pending: 0,
      preparing: 0,
      ready: 0,
      completed: 0,
      cancelled: 0,
    },

    statistics: statisticsWithPercentage,
  };
};

const getPopularFoodReport = async (query = {}) => {
  const type = query.type || "yearly";

  const match = {
    "order.paymentStatus": "PAID",
    "order.status": { $ne: "CANCELLED" },
  };

  //----------------------------------------
  // Daily / Monthly / Yearly
  //----------------------------------------

  if (type === "daily") {
    if (!query.month || !query.year) {
      const err = new Error("Month and year are required.");
      err.statusCode = 400;
      throw err;
    }

    match["order.createdAt"] = {
      $gte: new Date(Number(query.year), Number(query.month) - 1, 1),
      $lte: new Date(
        Number(query.year),
        Number(query.month),
        0,
        23,
        59,
        59,
        999
      ),
    };
  } else if (type === "monthly") {
    if (!query.year) {
      const err = new Error("Year is required.");
      err.statusCode = 400;
      throw err;
    }

    match["order.createdAt"] = {
      $gte: new Date(Number(query.year), 0, 1),
      $lte: new Date(
        Number(query.year),
        11,
        31,
        23,
        59,
        59,
        999
      ),
    };
  }

  //----------------------------------------
  // From / To
  //----------------------------------------

  if (query.from || query.to) {
    match["order.createdAt"] = match["order.createdAt"] || {};

    if (query.from) {
      match["order.createdAt"].$gte = new Date(query.from);
    }

    if (query.to) {
      const end = new Date(query.to);
      end.setHours(23, 59, 59, 999);
      match["order.createdAt"].$lte = end;
    }
  }

  //----------------------------------------
  // Summary
  //----------------------------------------

  const summary = await OrderItem.aggregate([
    {
      $lookup: {
        from: "orders",
        localField: "orderId",
        foreignField: "_id",
        as: "order",
      },
    },
    {
      $unwind: "$order",
    },
    {
      $match: match,
    },
    {
      $group: {
        _id: null,
        totalSold: {
          $sum: "$quantity",
        },
        totalRevenue: {
          $sum: "$subtotal",
        },
      },
    },
  ]);

  //----------------------------------------
  // Popular foods
  //----------------------------------------

  const foods = await OrderItem.aggregate([
    {
      $lookup: {
        from: "orders",
        localField: "orderId",
        foreignField: "_id",
        as: "order",
      },
    },
    {
      $unwind: "$order",
    },
    {
      $match: match,
    },
    {
      $lookup: {
        from: "foods",
        localField: "foodId",
        foreignField: "_id",
        as: "food",
      },
    },
    {
      $unwind: "$food",
    },
    {
      $group: {
        _id: "$food._id",
        foodName: {
          $first: "$food.name",
        },
        totalSold: {
          $sum: "$quantity",
        },
        revenue: {
          $sum: "$subtotal",
        },
      },
    },
    {
      $sort: {
        totalSold: -1,
      },
    },
  ]);

  const totalSold = summary.length ? summary[0].totalSold : 0;
  const totalRevenue = summary.length ? summary[0].totalRevenue : 0;

  return {
    summary: {
      totalFoods: foods.length,
      totalSold,
      totalRevenue,
      mostPopularFood: foods.length ? foods[0].foodName : null,
      highestSold: foods.length ? foods[0].totalSold : 0,
    },

    foods: foods.map((item) => ({
      foodId: item._id,
      foodName: item.foodName,
      totalSold: item.totalSold,
      revenue: item.revenue,
      percentage:
        totalSold === 0
          ? 0
          : Number(((item.totalSold / totalSold) * 100).toFixed(2)),
    })),
  };
};

module.exports = {
  getRevenueReport,
  getPeakHourReport,
  getOrderStatistics,
  getPopularFoodReport,
};
