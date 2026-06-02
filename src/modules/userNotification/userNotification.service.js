const UserNotification = require("./userNotification.model");
const { getPagination } = require("../../utils/pagination.util");

const create = (data) => UserNotification.create(data);

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
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
    UserNotification.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    UserNotification.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getById = (id) => UserNotification.findById(id);
const updateById = (id, data) =>
  UserNotification.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
const deleteById = (id) => UserNotification.findByIdAndDelete(id);

module.exports = { create, list, getById, updateById, deleteById };
