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
    "any.required": `"fullName" is required`,
    "string.empty": `"fullName" cannot be empty`,
    "string.min": `"fullName" must be at least 2 characters`,
    "string.max": `"fullName" must not exceed 100 characters`,
    "any.invalid": `"fullName" must contain at least first name and last name, using letters and spaces only`,
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
      "any.required": `"email" is required`,
      "string.empty": `"email" cannot be empty`,
      "string.max": `"email" must not exceed 254 characters`,
      "string.email": `"email" must be a valid email address`,
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
    "any.required": `"phone" is required`,
    "string.empty": `"phone" cannot be empty`,
    "string.phone": `"phone" must be a valid Vietnamese phone number`,
  }),

  password: Joi.string()
  .min(8)
  .max(128)
  .pattern(/^\S+$/)
  .pattern(/[a-z]/)
  .pattern(/[A-Z]/)
  .pattern(/[0-9]/)
  .pattern(/[^A-Za-z0-9]/)
  .required()
  .messages({
    "any.required": `"password" is required`,
    "string.empty": `"password" cannot be empty`,
    "string.min": `"password" must be at least 8 characters`,
    "string.max": `"password" must not exceed 128 characters`,
    "string.pattern.base":
      `"password" must contain uppercase, lowercase, number, special character, and no spaces`,
  }),

  avatarUrl: Joi.string().uri().allow(null, "").optional().messages({
    "string.uri": `"avatarUrl" must be a valid URL`,
  }),
}).unknown(false);

module.exports = {
  registerSchema,
};
