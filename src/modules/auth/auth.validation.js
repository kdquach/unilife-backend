const Joi = require("joi");

const registerSchema = Joi.object({
  fullName: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      "any.required": `"fullName" is required`,
      "string.empty": `"fullName" cannot be empty`,
      "string.min": `"fullName" must be at least 2 characters`,
      "string.max": `"fullName" must not exceed 100 characters`,
    }),

  email: Joi.string()
    .trim()
    .lowercase()
    .email({
      minDomainSegments: 2,
      tlds: {
        allow: true,
      },
    })
    .required()
    .messages({
      "any.required": `"email" is required`,
      "string.empty": `"email" cannot be empty`,
      "string.email": `"email" must be a valid email address`,
    }),

  phone: Joi.string()
    .trim()
    .required()
    .messages({
      "any.required": `"phone" is required`,
      "string.empty": `"phone" cannot be empty`,
    }),

  password: Joi.string()
    .min(8)
    .max(128)
    .required()
    .messages({
      "any.required": `"password" is required`,
      "string.empty": `"password" cannot be empty`,
      "string.min": `"password" must be at least 8 characters`,
    }),

  avatarUrl: Joi.string()
    .uri()
    .allow(null, "")
    .optional()
    .messages({
      "string.uri": `"avatarUrl" must be a valid URL`,
    }),
}).unknown(false);

module.exports = {
  registerSchema,
};