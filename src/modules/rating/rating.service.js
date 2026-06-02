const Rating = require("./rating.model");
const { getPagination } = require("../../utils/pagination.util");

const create = (data) => Rating.create(data);

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
    Rating.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
    Rating.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getById = (id) => Rating.findById(id);
const updateById = (id, data) =>
  Rating.findByIdAndUpdate(id, data, { new: true, runValidators: true });
const deleteById = (id) => Rating.findByIdAndDelete(id);

module.exports = { create, list, getById, updateById, deleteById };
