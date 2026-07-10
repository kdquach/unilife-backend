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

const getPeakHourReport = async (query = {}) => {

  const type = query.type || "daily";

  const match = {
    paymentStatus: "PAID",
    status: { $ne: "CANCELLED" },
  };

  // ===== Validation =====

  if (type === "daily") {

    if (!query.month || !query.year) {
      const err = new Error("Month and year are required.");
      err.statusCode = 400;
      throw err;
    }

    const start = new Date(
      Number(query.year),
      Number(query.month) - 1,
      1
    );

    const end = new Date(
      Number(query.year),
      Number(query.month),
      0,
      23,
      59,
      59,
      999
    );

    match.createdAt = {
      $gte: start,
      $lte: end,
    };
  }

  if (type === "monthly") {

    if (!query.year) {
      const err = new Error("Year is required.");
      err.statusCode = 400;
      throw err;
    }

    const start = new Date(Number(query.year),0,1);

    const end = new Date(
      Number(query.year),
      11,
      31,
      23,
      59,
      59,
      999
    );

    match.createdAt = {
      $gte:start,
      $lte:end,
    };
  }

  // from to

  if(query.from || query.to){

      match.createdAt = match.createdAt || {};

      if(query.from){
          match.createdAt.$gte = new Date(query.from);
      }

      if(query.to){
          const end = new Date(query.to);
          end.setHours(23,59,59,999);
          match.createdAt.$lte = end;
      }
  }

  //-------------------------------------------------

  const peakHours = await Order.aggregate([

      {
          $match:match
      },

      {
          $group:{

              _id:{
                  hour:{
                      $hour:"$createdAt"
                  }
              },

              orders:{
                  $sum:1
              },

              revenue:{
                  $sum:"$totalPrice"
              }

          }

      },

      {
          $project:{
              _id:0,
              hour:"$_id.hour",
              orders:1,
              revenue:1
          }
      },

      {
          $sort:{
              hour:1
          }
      }

  ]);

  let peakHour = null;

  if(peakHours.length){

      peakHour = peakHours.reduce((a,b)=>

          a.orders>b.orders?a:b

      );
  }

  return{

      summary:{

          peakHour: peakHour?.hour ?? null,

          maxOrders: peakHour?.orders ?? 0,

          revenueAtPeakHour: peakHour?.revenue ?? 0

      },

      peakHours

  };

};

module.exports = {
  getRevenueReport,
  getPeakHourReport,
};