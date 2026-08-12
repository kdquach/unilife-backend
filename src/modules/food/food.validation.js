const Joi = require("joi");

const createFoodSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      "any.required": `Food Name is required`,
      "string.empty": `Food Name cannot be empty`,
      "string.min": `Food Name must be at least 2 characters`,
      "string.max": `Food Name must not exceed 100 characters`,
    }),

  price: Joi.number()
    .integer()
    .min(1000)
    .required()
    .messages({
      "any.required": `Price is required`,
      "number.base": `Price must be a number`,
      "number.integer": `Price must be an integer`,
      "number.min": `Price must be at least 1000`,
    }),

  description: Joi.string()
    .trim()
    .max(500)
    .allow("")
    .optional()
    .messages({
      "string.base": `Description must be a string`,
      "string.max": `Description must not exceed 500 characters`,
    }),
}).unknown(true);

module.exports = {
  createFoodSchema,
};