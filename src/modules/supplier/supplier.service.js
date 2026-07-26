const Supplier = require("./supplier.model");
const IngredientBatch = require("../ingredientBatch/ingredientBatch.model");
const { getPagination } = require("../../utils/pagination.util");

const escapeRegExp = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const checkDuplicate = async (data, excludeId = null) => {
  const name = String(data.name || "").trim();
  const phone = data.phone ? String(data.phone).trim() : "";

  if (name) {
    const nameFilter = {
      name: new RegExp(`^${escapeRegExp(name)}$`, "i"),
      deletedAt: null,
    };
    if (excludeId) {
      nameFilter._id = { $ne: excludeId };
    }
    const existingName = await Supplier.findOne(nameFilter);
    if (existingName) {
      const error = new Error("A supplier with this name already exists");
      error.statusCode = 409;
      throw error;
    }
  }

  if (phone) {
    const phoneFilter = {
      phone: new RegExp(`^${escapeRegExp(phone)}$`, "i"),
      deletedAt: null,
    };
    if (excludeId) {
      phoneFilter._id = { $ne: excludeId };
    }
    const existingPhone = await Supplier.findOne(phoneFilter);
    if (existingPhone) {
      const error = new Error("A supplier with this phone number already exists");
      error.statusCode = 409;
      throw error;
    }
  }
};

const create = async (data) => {
  await checkDuplicate(data);
  return Supplier.create(data);
};

const list = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = { deletedAt: null };
  if (query.isActive !== undefined) filter.isActive = query.isActive === "true";
  if (query.keyword)
    filter.$or = [
      { name: new RegExp(query.keyword, "i") },
      { contactName: new RegExp(query.keyword, "i") },
      { phone: new RegExp(query.keyword, "i") },
      { address: new RegExp(query.keyword, "i") },
    ];

  const [items, total] = await Promise.all([
    Supplier.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
    Supplier.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getById = (id) => Supplier.findById(id);
const updateById = async (id, data) => {
  await checkDuplicate(data, id);
  return Supplier.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};
const deleteById = (id) =>
  Supplier.findByIdAndUpdate(
    id,
    { isActive: false, deletedAt: new Date() },
    { new: true },
  );

const getBatches = async (supplierId, query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = { supplierId };

  const [items, total] = await Promise.all([
    IngredientBatch.find(filter)
      .populate("ingredientId", "name unit")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    IngredientBatch.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

module.exports = { create, list, getById, updateById, deleteById, getBatches };
