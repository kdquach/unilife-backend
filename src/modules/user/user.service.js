const mongoose = require("mongoose");
const User = require("./user.model");
const { getPagination } = require("../../utils/pagination.util");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const { hashPassword } = require("../../utils/password.util");
const ROLES = require("../../constants/roles.constant");

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const STAFF_ROLES = [
  ROLES.ADMIN,
  ROLES.MANAGER,
  ROLES.COUNTER_STAFF,
  ROLES.KITCHEN_STAFF,
];
const MANAGER_ASSIGNABLE_STAFF_ROLES = [
  ROLES.COUNTER_STAFF,
  ROLES.KITCHEN_STAFF,
];

const STAFF_UPDATE_FIELDS = ["fullName", "email", "phone", "role", "isActive"];

const TEXT_HAS_LETTER = /\p{L}/u;
const TEXT_ONLY_LETTERS_SPACES_AND_NUMBERS = /^[\p{L}\s\d]+$/u;

const assertHasLetter = (value, fieldName) => {
  if (!TEXT_HAS_LETTER.test(value)) {
    const err = new Error(`${fieldName} must contain at least one letter`);
    err.statusCode = 400;
    throw err;
  }
};

const assertOnlyLettersSpacesAndNumbers = (value, fieldName) => {
  if (!TEXT_ONLY_LETTERS_SPACES_AND_NUMBERS.test(value)) {
    const err = new Error(`${fieldName} can only contain letters, spaces, and numbers`);
    err.statusCode = 400;
    throw err;
  }
};

const assertValidFullName = (fullName) => {
  if (!fullName) {
    const err = new Error("Full Name is required");
    err.statusCode = 400;
    throw err;
  }

  const normalizedFullName = String(fullName).trim();

  if (normalizedFullName === "") {
    const err = new Error("Full Name cannot be empty");
    err.statusCode = 400;
    throw err;
  }

  if (normalizedFullName.length < 2) {
    const err = new Error("Full Name must be at least 2 characters");
    err.statusCode = 400;
    throw err;
  }

  if (normalizedFullName.length > 100) {
    const err = new Error("Full Name must not exceed 100 characters");
    err.statusCode = 400;
    throw err;
  }

  // Không cho khoảng trắng đầu/cuối
  if (fullName !== fullName.trim()) {
    const err = new Error("Full Name must contain at least first name and last name, using letters and spaces only");
    err.statusCode = 400;
    throw err;
  }

  // Không cho nhiều khoảng trắng liên tiếp
  if (/\s{2,}/.test(normalizedFullName)) {
    const err = new Error("Full Name must contain at least first name and last name, using letters and spaces only");
    err.statusCode = 400;
    throw err;
  }

  // Phải có ít nhất first name và last name, chỉ letters (bao gồm tiếng Việt)
  if (!/^[A-Za-zÀ-ỹĐđ]+(?:\s+[A-Za-zÀ-ỹĐđ]+)+$/.test(normalizedFullName)) {
    const err = new Error("Full Name must contain at least first name and last name, using letters and spaces only");
    err.statusCode = 400;
    throw err;
  }

  return normalizedFullName;
};

const assertValidPhone = (phone) => {
  if (!phone) {
    const err = new Error("Phone is required");
    err.statusCode = 400;
    throw err;
  }

  const normalizedPhone = String(phone).trim();

  if (normalizedPhone === "") {
    const err = new Error("Phone cannot be empty");
    err.statusCode = 400;
    throw err;
  }

  // Chỉ cho phép số
  if (!/^\d+$/.test(normalizedPhone)) {
    const err = new Error("Phone must be a valid Vietnamese phone number");
    err.statusCode = 400;
    throw err;
  }

  // Số điện thoại Việt Nam: 10 chữ số
  if (normalizedPhone.length !== 10) {
    const err = new Error("Phone must be a valid Vietnamese phone number");
    err.statusCode = 400;
    throw err;
  }

  // Phải bắt đầu bằng 03, 05, 07, 08 hoặc 09
  if (!/^(03|05|07|08|09)\d{8}$/.test(normalizedPhone)) {
    const err = new Error("Phone must be a valid Vietnamese phone number");
    err.statusCode = 400;
    throw err;
  }

  return normalizedPhone;
};

const assertValidPassword = (password) => {
  if (!password) {
    const err = new Error("Password is required");
    err.statusCode = 400;
    throw err;
  }

  if (password.trim() === "") {
    const err = new Error("Password cannot be empty");
    err.statusCode = 400;
    throw err;
  }

  if (password.length < 8) {
    const err = new Error("Password must be at least 8 characters");
    err.statusCode = 400;
    throw err;
  }

  if (password.length > 128) {
    const err = new Error("Password must not exceed 128 characters");
    err.statusCode = 400;
    throw err;
  }

  if (/\s/.test(password)) {
    const err = new Error("Password must contain uppercase, lowercase, number, special character, and no spaces");
    err.statusCode = 400;
    throw err;
  }

  if (!/[A-Z]/.test(password)) {
    const err = new Error("Password must contain uppercase, lowercase, number, special character, and no spaces");
    err.statusCode = 400;
    throw err;
  }

  if (!/[a-z]/.test(password)) {
    const err = new Error("Password must contain uppercase, lowercase, number, special character, and no spaces");
    err.statusCode = 400;
    throw err;
  }

  if (!/[0-9]/.test(password)) {
    const err = new Error("Password must contain uppercase, lowercase, number, special character, and no spaces");
    err.statusCode = 400;
    throw err;
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    const err = new Error("Password must contain uppercase, lowercase, number, special character, and no spaces");
    err.statusCode = 400;
    throw err;
  }
};

const assertValidEmail = (email) => {
  if (!email) {
    const err = new Error("Email is required");
    err.statusCode = 400;
    throw err;
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  if (normalizedEmail === "") {
    const err = new Error("Email cannot be empty");
    err.statusCode = 400;
    throw err;
  }

  if (normalizedEmail.length > 254) {
    const err = new Error("Email must not exceed 254 characters");
    err.statusCode = 400;
    throw err;
  }

  // Không cho khoảng trắng
  if (/\s/.test(normalizedEmail)) {
    const err = new Error("Email must be a valid email address");
    err.statusCode = 400;
    throw err;
  }

  // Email phải có đúng 1 ký tự @
  const atCount = (normalizedEmail.match(/@/g) || []).length;
  if (atCount !== 1) {
    const err = new Error("Email must be a valid email address");
    err.statusCode = 400;
    throw err;
  }

  const [localPart, domain] = normalizedEmail.split("@");

  // Local part và domain không được rỗng
  if (!localPart || !domain) {
    const err = new Error("Email must be a valid email address");
    err.statusCode = 400;
    throw err;
  }

  // Không cho dấu . ở đầu/cuối local part
  if (localPart.startsWith(".") || localPart.endsWith(".")) {
    const err = new Error("Email must be a valid email address");
    err.statusCode = 400;
    throw err;
  }

  // Không cho ".."
  if (normalizedEmail.includes("..")) {
    const err = new Error("Email must be a valid email address");
    err.statusCode = 400;
    throw err;
  }

  // Local part cho phép: a-z A-Z 0-9 . _ % + - và các ký tự đặc biệt
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)) {
    const err = new Error("Email must be a valid email address");
    err.statusCode = 400;
    throw err;
  }

  // Domain chỉ cho chữ, số, dấu - và .
  if (!/^[A-Za-z0-9.-]+$/.test(domain)) {
    const err = new Error("Email must be a valid email address");
    err.statusCode = 400;
    throw err;
  }

  // Domain không được bắt đầu/kết thúc bằng .
  if (domain.startsWith(".") || domain.endsWith(".")) {
    const err = new Error("Email must be a valid email address");
    err.statusCode = 400;
    throw err;
  }

  // Domain không được bắt đầu/kết thúc bằng -
  if (domain.startsWith("-") || domain.endsWith("-")) {
    const err = new Error("Email must be a valid email address");
    err.statusCode = 400;
    throw err;
  }

  // Domain phải có ít nhất 1 dấu .
  if (!domain.includes(".")) {
    const err = new Error("Email must be a valid email address");
    err.statusCode = 400;
    throw err;
  }

  // Kiểm tra từng domain segment
  const domainParts = domain.split(".");
  if (domainParts.some((part) => !part || part.startsWith("-") || part.endsWith("-"))) {
    const err = new Error("Email must be a valid email address");
    err.statusCode = 400;
    throw err;
  }

  // TLD phải có ít nhất 2 ký tự
  const tld = domainParts[domainParts.length - 1];
  if (!/^[A-Za-z]{2,}$/.test(tld)) {
    const err = new Error("Email must be a valid email address");
    err.statusCode = 400;
    throw err;
  }

  return normalizedEmail;
};

const getProfile = (userId) => User.findById(userId).select("-passwordHash");

const updateProfile = (userId, data) => {
  const updateFields = {};
  if (data.fullName !== undefined) updateFields.fullName = data.fullName;
  if (data.phone !== undefined) updateFields.phone = data.phone;

  return User.findByIdAndUpdate(
    userId,
    { $set: updateFields },
    { new: true, runValidators: true },
  ).select("-passwordHash");
};

const uploadAvatar = async (userId, file) => {
  const oldUser = await User.findById(userId);

  const uploadDir = process.env.AVATAR_UPLOAD_DIR || "uploads/avatars";
  fs.mkdirSync(uploadDir, { recursive: true });

  const filename = `${userId}-${Date.now()}.webp`;
  const outputPath = path.join(uploadDir, filename);

  // Compress to WebP with 80% quality and resize to 400x400
  await sharp(file.buffer)
    .resize(400, 400, {
      fit: "cover",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toFile(outputPath);

  // Delete old custom avatar to prevent orphaned files
  if (oldUser && oldUser.avatarUrl && oldUser.avatarUrl.startsWith("/uploads/avatars/")) {
    const isDefault = oldUser.avatarUrl.includes("default-");
    if (!isDefault) {
      const oldFilePath = path.join(process.cwd(), oldUser.avatarUrl);
      try {
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      } catch (err) {
        console.error("Failed to delete old avatar file:", err.message);
      }
    }
  }

  const avatarUrl = `/uploads/avatars/${filename}`;
  return User.findByIdAndUpdate(
    userId,
    { avatarUrl },
    { new: true, runValidators: true },
  ).select("-passwordHash");
};

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

const escapeRegExp = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toBoolean = (value) => {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

const buildStaffFilter = (query = {}) => {
  const filter = { role: { $in: STAFF_ROLES } };
  const requestedRole = query.role;
  const isActive = toBoolean(query.isActive);
  const keyword = (query.keyword || query.q || query.search || "").trim();

  if (requestedRole && STAFF_ROLES.includes(requestedRole)) {
    filter.role = requestedRole;
  }

  if (isActive !== undefined) {
    filter.isActive = isActive;
  }

  if (keyword) {
    const regex = new RegExp(escapeRegExp(keyword), "i");
    filter.$or = [{ fullName: regex }, { email: regex }, { phone: regex }];
  }

  return filter;
};

const listStaffs = async (query = {}) => {
  const { page, limit, skip } = getPagination(query);
  const filter = buildStaffFilter(query);

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

const getStaffById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error("Invalid staff id");
    err.statusCode = 400;
    throw err;
  }

  const staff = await User.findOne({
    _id: id,
    role: { $in: STAFF_ROLES },
  }).select("-passwordHash");

  if (!staff) {
    const err = new Error("Staff not found");
    err.statusCode = 404;
    throw err;
  }

  return staff;
};

const validateStaffId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error("Invalid staff id");
    err.statusCode = 400;
    throw err;
  }
};

const ensureStaffRole = (role) => {
  if (!STAFF_ROLES.includes(role)) {
    const err = new Error("Invalid staff role");
    err.statusCode = 400;
    throw err;
  }
};

const ensureCanAssignStaffRole = (actor, currentRole, role) => {
  if (role === ROLES.ADMIN && actor?.role !== ROLES.ADMIN) {
    const err = new Error("Only admins can assign admin role");
    err.statusCode = 403;
    throw err;
  }

  if (actor?.role === ROLES.MANAGER) {
    const canManageTarget = MANAGER_ASSIGNABLE_STAFF_ROLES.includes(currentRole);
    const canAssignRole = MANAGER_ASSIGNABLE_STAFF_ROLES.includes(role);

    if (!canManageTarget || !canAssignRole) {
      const err = new Error("Managers can only manage counter or kitchen staff");
      err.statusCode = 403;
      throw err;
    }
  }
};

const ensureCanManageStaff = (actor, staff) => {
  if (
    actor?.role === ROLES.MANAGER &&
    !MANAGER_ASSIGNABLE_STAFF_ROLES.includes(staff.role)
  ) {
    const err = new Error("Managers can only manage counter or kitchen staff");
    err.statusCode = 403;
    throw err;
  }
};

const getStaffDocumentById = async (id) => {
  validateStaffId(id);

  const staff = await User.findOne({
    _id: id,
    role: { $in: STAFF_ROLES },
  });

  if (!staff) {
    const err = new Error("Staff not found");
    err.statusCode = 404;
    throw err;
  }

  return staff;
};

const pickStaffUpdateFields = (data = {}) =>
  STAFF_UPDATE_FIELDS.reduce((payload, field) => {
    if (data[field] !== undefined) payload[field] = data[field];
    return payload;
  }, {});

const normalizeStaffUpdatePayload = (data = {}) => {
  const payload = pickStaffUpdateFields(data);

  if (payload.fullName !== undefined) {
    if (typeof payload.fullName !== "string" || payload.fullName.trim() === "") {
      const err = new Error("Full name cannot be empty");
      err.statusCode = 400;
      throw err;
    }
    payload.fullName = payload.fullName.trim();
  }

  if (payload.email !== undefined) {
    if (typeof payload.email !== "string" || payload.email.trim() === "") {
      const err = new Error("Email cannot be empty");
      err.statusCode = 400;
      throw err;
    }
    payload.email = payload.email.trim().toLowerCase();
  }

  if (payload.phone !== undefined && payload.phone !== null) {
    if (typeof payload.phone !== "string" || !/^[0-9]{9,15}$/.test(payload.phone)) {
      const err = new Error("Invalid phone number format");
      err.statusCode = 400;
      throw err;
    }
  }

  if (payload.role !== undefined) {
    ensureStaffRole(payload.role);
  }

  if (payload.isActive !== undefined && typeof payload.isActive !== "boolean") {
    const parsed = toBoolean(payload.isActive);
    if (parsed === undefined) {
      const err = new Error("Staff status must be a boolean");
      err.statusCode = 400;
      throw err;
    }
    payload.isActive = parsed;
  }

  return payload;
};

const normalizeStaffCreatePayload = (data = {}) => {
  const payload = {
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    password: data.password,
    role: data.role,
    isActive: data.isActive,
  };

  // Validate fullName
  payload.fullName = assertValidFullName(data.fullName);

  // Validate email
  payload.email = assertValidEmail(data.email);

  // Validate password
  assertValidPassword(data.password);
  payload.password = data.password;

  // Validate phone (required for staff)
  payload.phone = assertValidPhone(data.phone);

  ensureStaffRole(payload.role);

  if (payload.role === ROLES.ADMIN) {
    const err = new Error("Admin staff cannot be created from staff management");
    err.statusCode = 403;
    throw err;
  }

  if (payload.isActive !== undefined && typeof payload.isActive !== "boolean") {
    const parsed = toBoolean(payload.isActive);
    if (parsed === undefined) {
      const err = new Error("Staff status must be a boolean");
      err.statusCode = 400;
      throw err;
    }
    payload.isActive = parsed;
  }

  return payload;
};

const changeStaffRole = async (actor, id, role) => {
  ensureStaffRole(role);

  if (actor?._id?.toString() === id.toString()) {
    const err = new Error("Cannot change your own role");
    err.statusCode = 400;
    throw err;
  }

  const staff = await getStaffDocumentById(id);
  ensureCanAssignStaffRole(actor, staff.role, role);

  staff.role = role;
  await staff.save();

  const safeStaff = staff.toObject({ virtuals: true });
  delete safeStaff.passwordHash;
  return safeStaff;
};

const updateStaff = async (actor, id, data) => {
  const payload = normalizeStaffUpdatePayload(data);
  const staff = await getStaffDocumentById(id);

  ensureCanManageStaff(actor, staff);

  if (payload.role !== undefined) {
    if (actor?._id?.toString() === id.toString()) {
      const err = new Error("Cannot change your own role");
      err.statusCode = 400;
      throw err;
    }
    ensureCanAssignStaffRole(actor, staff.role, payload.role);
  }

  if (payload.isActive !== undefined && actor?._id?.toString() === id.toString()) {
    const err = new Error("Cannot change your own status");
    err.statusCode = 400;
    throw err;
  }

  if (payload.email && payload.email !== staff.email) {
    const existed = await User.findOne({
      email: payload.email,
      _id: { $ne: id },
    });

    if (existed) {
      const err = new Error("Email already exists");
      err.statusCode = 409;
      throw err;
    }
  }

  Object.assign(staff, payload);
  await staff.save();

  const safeStaff = staff.toObject({ virtuals: true });
  delete safeStaff.passwordHash;
  return safeStaff;
};

const createStaff = async (actor, data) => {
  const payload = normalizeStaffCreatePayload(data);

  if (
    actor?.role === ROLES.MANAGER &&
    !MANAGER_ASSIGNABLE_STAFF_ROLES.includes(payload.role)
  ) {
    const err = new Error("Managers can only create counter or kitchen staff");
    err.statusCode = 403;
    throw err;
  }

  const existing = await User.findOne({ email: payload.email });
  if (existing) {
    const err = new Error("Email already exists");
    err.statusCode = 409;
    throw err;
  }

  // Check phone duplicate
  const existingPhone = await User.findOne({ phone: payload.phone });
  if (existingPhone) {
    const err = new Error("Phone number already exists");
    err.statusCode = 409;
    throw err;
  }

  const staff = await User.create({
    fullName: payload.fullName,
    email: payload.email,
    phone: payload.phone,
    passwordHash: await hashPassword(payload.password),
    role: payload.role,
    avatarUrl: data.avatarUrl || null,
    isActive: payload.isActive !== undefined ? payload.isActive : true,
  });

  return staff.toSafeJSON();
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
  const email = assertValidEmail(data.email);
  const phone = assertValidPhone(data.phone);

  // CHECK EMAIL ĐÃ TỒN TẠI CHƯA
  const existingEmail = await User.findOne({ email });

  // CHỈ CẦN TỒN TẠI → BÁO LỖI
  if (existingEmail) {
    const err = new Error("Email already exists");
    err.statusCode = 409;
    throw err;
  }

  // CHECK PHONE ĐÃ TỒN TẠI CHƯA
  const existingPhone = await User.findOne({ phone });
  if (existingPhone) {
    const err = new Error("Phone number already exists");
    err.statusCode = 409;
    throw err;
  }

  // Validate fullName
  const fullName = assertValidFullName(data.fullName);

  // Validate password
  assertValidPassword(data.password);

  const user = await User.create({
    fullName,
    email,
    phone,
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
  listStaffs,
  getStaffById,
  changeStaffRole,
  updateStaff,
  createStaff,
  updateUserStatus,
  updateUserRole,
  getUserById,
  createUser,
  updateUser,
};
