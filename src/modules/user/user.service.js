const User = require("./user.model");
const { getPagination } = require("../../utils/pagination.util");
const { hashPassword } = require("../../utils/password.util");
const ROLES = require("../../constants/roles.constant");

const getProfile = (userId) => User.findById(userId).select("-passwordHash");

const updateProfile = (userId, data) =>
  User.findByIdAndUpdate(
    userId,
    { fullName: data.fullName, phone: data.phone },
    { new: true, runValidators: true },
  ).select("-passwordHash");

const uploadAvatar = (userId, file) =>
  User.findByIdAndUpdate(
    userId,
    { avatarUrl: `/uploads/avatars/${file.filename}` },
    { new: true, runValidators: true },
  ).select("-passwordHash");

const listUsers = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.role) filter.role = query.role;
  if (query.isActive !== undefined) filter.isActive = query.isActive === "true";
  if (query.keyword)
    filter.$or = [
      { fullName: new RegExp(query.keyword, "i") },
      { email: new RegExp(query.keyword, "i") },
      { phone: new RegExp(query.keyword, "i") },
    ];

  const [items, total] = await Promise.all([
    User.find(filter)
      .select("-passwordHash")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    User.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const updateUserStatus = (id, isActive) =>
  User.findByIdAndUpdate(
    id,
    { isActive },
    { new: true, runValidators: true },
  ).select("-passwordHash");
const updateUserRole = (id, role) =>
  User.findByIdAndUpdate(
    id,
    { role },
    { new: true, runValidators: true },
  ).select("-passwordHash");

const getUserById = (id) => 
  User.findById(id)
    .select("-passwordHash");

const createUser = async (data) => {
  const existing = await User.findOne({
    email: data.email,
  });

  if (existing) {
    const err = new Error("Email already exists");
    err.statusCode = 409;
    throw err;
  }

  const user = await User.create({
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    passwordHash: await hashPassword(data.password),
    role: data.role || ROLES.CUSTOMER,
    avatarUrl: data.avatarUrl || null,
    isActive: true,
  });

  return user.toSafeJSON();
};

const updateUser = async (id, data) => {
  const user = await User.findById(id);

  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  if (data.email && data.email !== user.email) {
    const existed = await User.findOne({
      email: data.email,
      _id: { $ne: id },
    });

    if (existed) {
      const err = new Error("Email already exists");
      err.statusCode = 409;
      throw err;
    }
  }

  return User.findByIdAndUpdate(
    id,
    {
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      isActive: data.isActive,
    },
    {
      new: true,
      runValidators: true,
    }
  ).select("-passwordHash");
};

module.exports = {
  getProfile,
  updateProfile,
  uploadAvatar,
  listUsers,
  updateUserStatus,
  updateUserRole,
  getUserById,
  createUser,
  updateUser,
};
