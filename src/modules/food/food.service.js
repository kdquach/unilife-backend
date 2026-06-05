const Food = require("./food.model");
const { getPagination } = require("../../utils/pagination.util");

const create = (data) => Food.create(data);

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};

  // Lọc trạng thái hoạt động
  if (query.isActive !== undefined) filter.isActive = query.isActive === "true";

  // Lọc theo loại món ăn dựa vào isMenuItem:
  //   kind=alwaysAvailable → isMenuItem: false (món bán hàng ngày)
  //   kind=menuItem        → isMenuItem: true  (món bán theo lịch menu)
  //   isMenuItem=true/false → truyền trực tiếp
  if (query.kind === "alwaysAvailable") {
    filter.isMenuItem = false;
  } else if (query.kind === "menuItem") {
    filter.isMenuItem = true;
  } else if (query.isMenuItem !== undefined) {
    filter.isMenuItem = query.isMenuItem === "true";
  }

  // Lọc theo danh mục
  if (query.categoryId) filter.categoryId = query.categoryId;

  // Tìm kiếm theo tên hoặc mô tả
  if (query.keyword)
    filter.$or = [
      { name: new RegExp(query.keyword, "i") },
      { description: new RegExp(query.keyword, "i") },
    ];

  const [items, total] = await Promise.all([
    Food.find(filter)
      .populate("categoryId", "name")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    Food.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getById = (id) =>
  Food.findById(id).populate("categoryId", "name");

const updateById = (id, data) =>
  Food.findByIdAndUpdate(id, data, { new: true, runValidators: true });

const deleteById = (id) => Food.findByIdAndDelete(id);

module.exports = { create, list, getById, updateById, deleteById };

