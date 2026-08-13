const Joi = require("joi");

const fullNameSchema = Joi.string()
  .min(2)
  .max(100)
  .required()
  .custom((value, helpers) => {
    // Không cho khoảng trắng đầu/cuối
    if (value !== value.trim()) {
      return helpers.error("any.invalid");
    }

    // Không cho nhiều khoảng trắng liên tiếp
    if (/\s{2,}/.test(value)) {
      return helpers.error("any.invalid");
    }

    if (!/^[A-Za-zÀ-ỹĐđ]+(?:\s+[A-Za-zÀ-ỹĐđ]+)+$/.test(value)) {
      return helpers.error("any.invalid");
    }

    return value;
  })
  .messages({
    "any.required": `Full Name is required`,
    "string.empty": `Full Name cannot be empty`,
    "string.min": `Full Name must be at least 2 characters`,
    "string.max": `Full Name must not exceed 100 characters`,
    "any.invalid": `Full Name must contain at least first name and last name, using letters and spaces only`,
  });

const registerSchema = Joi.object({
  fullName: fullNameSchema,

  email: Joi.string()
    .trim()
    .lowercase()
    .max(254)
    .required()
    .custom((value, helpers) => {
      // Không cho khoảng trắng
      if (/\s/.test(value)) {
        return helpers.error("string.email");
      }

      // Email phải có đúng 1 ký tự @
      const atCount = (value.match(/@/g) || []).length;

      if (atCount !== 1) {
        return helpers.error("string.email");
      }

      const [localPart, domain] = value.split("@");

      // Local part và domain không được rỗng
      if (!localPart || !domain) {
        return helpers.error("string.email");
      }

      // Không cho dấu . ở đầu/cuối local part
      if (localPart.startsWith(".") || localPart.endsWith(".")) {
        return helpers.error("string.email");
      }

      // Không cho ".."
      if (value.includes("..")) {
        return helpers.error("string.email");
      }

      // Local part
      // Cho phép:
      // a-z A-Z 0-9 . _ % + -
      if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)) {
        return helpers.error("string.email");
      }

      // Domain chỉ cho chữ, số, dấu - và .
      if (!/^[A-Za-z0-9.-]+$/.test(domain)) {
        return helpers.error("string.email");
      }

      // Domain không được bắt đầu/kết thúc bằng .
      if (domain.startsWith(".") || domain.endsWith(".")) {
        return helpers.error("string.email");
      }

      // Domain không được bắt đầu/kết thúc bằng -
      if (domain.startsWith("-") || domain.endsWith("-")) {
        return helpers.error("string.email");
      }

      // Domain phải có ít nhất 1 dấu .
      if (!domain.includes(".")) {
        return helpers.error("string.email");
      }

      // Kiểm tra từng domain segment
      const domainParts = domain.split(".");

      if (
        domainParts.some(
          (part) => !part || part.startsWith("-") || part.endsWith("-"),
        )
      ) {
        return helpers.error("string.email");
      }

      // TLD phải có ít nhất 2 ký tự
      const tld = domainParts[domainParts.length - 1];

      if (!/^[A-Za-z]{2,}$/.test(tld)) {
        return helpers.error("string.email");
      }

      return value;
    })
    .messages({
      "any.required": `Email is required`,
      "string.empty": `Email cannot be empty`,
      "string.max": `Email must not exceed 254 characters`,
      "string.email": `Email must be a valid email address`,
    }),

  phone: Joi.string()
  .trim()
  .required()
  .custom((value, helpers) => {
    // Chỉ cho phép số
    if (!/^\d+$/.test(value)) {
      return helpers.error("string.phone");
    }

    // Số điện thoại Việt Nam: 10 chữ số
    if (value.length !== 10) {
      return helpers.error("string.phone");
    }

    // Phải bắt đầu bằng 03, 05, 07, 08 hoặc 09
    if (!/^(03|05|07|08|09)\d{8}$/.test(value)) {
      return helpers.error("string.phone");
    }

    return value;
  })
  .messages({
    "any.required": `Phone is required`,
    "string.empty": `Phone cannot be empty`,
    "string.phone": `Phone must be a valid Vietnamese phone number`,
  }),

  password: Joi.string()
  .min(8)
  .max(128)
  .custom((value, helpers) => {
    // Check for spaces
    if (/\s/.test(value)) {
      return helpers.error("any.invalid");
    }

    // Check for at least one lowercase
    if (!/[a-z]/.test(value)) {
      return helpers.error("any.invalid");
    }

    // Check for at least one uppercase
    if (!/[A-Z]/.test(value)) {
      return helpers.error("any.invalid");
    }

    // Check for at least one number
    if (!/[0-9]/.test(value)) {
      return helpers.error("any.invalid");
    }

    // Check for at least one special character
    if (!/[^A-Za-z0-9]/.test(value)) {
      return helpers.error("any.invalid");
    }

    return value;
  })
  .required()
  .messages({
    "any.required": `Password is required`,
    "string.empty": `Password cannot be empty`,
    "string.min": `Password must be at least 8 characters`,
    "string.max": `Password must not exceed 128 characters`,
    "any.invalid":
      `Password must contain uppercase, lowercase, number, special character, and no spaces`,
  }),

  avatarUrl: Joi.string().uri().allow(null, "").optional().messages({
    "string.uri": `"avatarUrl" must be a valid URL`,
  }),
}).unknown(false);

const passwordSchema = Joi.string()
  .min(8)
  .max(128)
  .custom((value, helpers) => {
    // Check for spaces
    if (/\s/.test(value)) {
      return helpers.error("any.invalid");
    }

    // Check for at least one lowercase
    if (!/[a-z]/.test(value)) {
      return helpers.error("any.invalid");
    }

    // Check for at least one uppercase
    if (!/[A-Z]/.test(value)) {
      return helpers.error("any.invalid");
    }

    // Check for at least one number
    if (!/[0-9]/.test(value)) {
      return helpers.error("any.invalid");
    }

    // Check for at least one special character
    if (!/[^A-Za-z0-9]/.test(value)) {
      return helpers.error("any.invalid");
    }

    return value;
  })
  .required()
  .messages({
    "any.required": `Password is required`,
    "string.empty": `Password cannot be empty`,
    "string.min": `Password must be at least 8 characters`,
    "string.max": `Password must not exceed 128 characters`,
    "any.invalid":
      `Password must contain uppercase, lowercase, number, special character, and no spaces`,
  });

const resetPasswordSchema = Joi.object({
  email: Joi.string()
    .trim()
    .lowercase()
    .max(254)
    .required()
    .custom((value, helpers) => {
      // Không cho khoảng trắng
      if (/\s/.test(value)) {
        return helpers.error("string.email");
      }

      // Email phải có đúng 1 ký tự @
      const atCount = (value.match(/@/g) || []).length;

      if (atCount !== 1) {
        return helpers.error("string.email");
      }

      const [localPart, domain] = value.split("@");

      // Local part và domain không được rỗng
      if (!localPart || !domain) {
        return helpers.error("string.email");
      }

      // Không cho dấu . ở đầu/cuối local part
      if (localPart.startsWith(".") || localPart.endsWith(".")) {
        return helpers.error("string.email");
      }

      // Không cho ".."
      if (value.includes("..")) {
        return helpers.error("string.email");
      }

      // Local part
      // Cho phép:
      // a-z A-Z 0-9 . _ % + -
      if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)) {
        return helpers.error("string.email");
      }

      // Domain chỉ cho chữ, số, dấu - và .
      if (!/^[A-Za-z0-9.-]+$/.test(domain)) {
        return helpers.error("string.email");
      }

      // Domain không được bắt đầu/kết thúc bằng .
      if (domain.startsWith(".") || domain.endsWith(".")) {
        return helpers.error("string.email");
      }

      // Domain không được bắt đầu/kết thúc bằng -
      if (domain.startsWith("-") || domain.endsWith("-")) {
        return helpers.error("string.email");
      }

      // Domain phải có ít nhất 1 dấu .
      if (!domain.includes(".")) {
        return helpers.error("string.email");
      }

      // Kiểm tra từng domain segment
      const domainParts = domain.split(".");

      if (
        domainParts.some(
          (part) => !part || part.startsWith("-") || part.endsWith("-"),
        )
      ) {
        return helpers.error("string.email");
      }

      // TLD phải có ít nhất 2 ký tự
      const tld = domainParts[domainParts.length - 1];

      if (!/^[A-Za-z]{2,}$/.test(tld)) {
        return helpers.error("string.email");
      }

      return value;
    })
    .messages({
      "any.required": `Email is required`,
      "string.empty": `Email cannot be empty`,
      "string.max": `Email must not exceed 254 characters`,
      "string.email": `Email must be a valid email address`,
    }),

  otp: Joi.string()
    .trim()
    .required()
    .messages({
      "any.required": `OTP is required`,
      "string.empty": `OTP cannot be empty`,
    }),

  newPassword: passwordSchema,
}).unknown(false);

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .required()
    .messages({
      "any.required": `Current password is required`,
      "string.empty": `Current password cannot be empty`,
    }),

  newPassword: passwordSchema
    .disallow(Joi.ref('currentPassword'))
    .messages({
      "any.invalid": `New password must be different from current password`,
    }),
}).unknown(false);

const updateProfileSchema = Joi.object({
  fullName: fullNameSchema,
  phone: Joi.string()
    .trim()
    .allow(null, "")
    .custom((value, helpers) => {
      // Cho phép null hoặc empty string
      if (value === null || value === "") {
        return value;
      }

      // Chỉ cho phép số
      if (!/^\d+$/.test(value)) {
        return helpers.error("string.phone");
      }

      // Số điện thoại Việt Nam: 10 chữ số
      if (value.length !== 10) {
        return helpers.error("string.phone");
      }

      // Phải bắt đầu bằng 03, 05, 07, 08 hoặc 09
      if (!/^(03|05|07|08|09)\d{8}$/.test(value)) {
        return helpers.error("string.phone");
      }

      return value;
    })
    .messages({
      "string.phone": `Phone must be a valid Vietnamese phone number`,
    }),
}).unknown(false);

module.exports = {
  registerSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
};
