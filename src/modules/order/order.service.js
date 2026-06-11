const Order = require("./order.model");
const { getPagination } = require("../../utils/pagination.util");

const create = (data) => Order.create(data);

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.userId) filter.userId = query.userId;
  if (query.isActive !== undefined) filter.isActive = query.isActive === "true";
  if (query.status) filter.status = query.status;
  if (query.type) filter.type = query.type;
  if (query.keyword)
    filter.$or = [
      { name: new RegExp(query.keyword, "i") },
      { title: new RegExp(query.keyword, "i") },
      { email: new RegExp(query.keyword, "i") },
      { fullName: new RegExp(query.keyword, "i") },
    ];

  const [items, total] = await Promise.all([
    Order.find(filter)
      .populate("queue")
      .populate({
        path: "items",
        populate: {
          path: "menuScheduleItemId",
          populate: {
            path: "foodId",
          },
        },
      })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    Order.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getById = (id) =>
  Order.findById(id)
    .populate("queue")
    .populate({
      path: "items",
      populate: {
        path: "menuScheduleItemId",
        populate: {
          path: "foodId",
        },
      },
    });
const updateById = (id, data) =>
  Order.findByIdAndUpdate(id, data, { new: true, runValidators: true });
const deleteById = (id) => Order.findByIdAndDelete(id);

module.exports = { create, list, getById, updateById, deleteById };
