const Joi = require("joi");

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const createMenuScheduleItemSchema = Joi.object({
  menuScheduleId: Joi.string().pattern(objectIdRegex).required().messages({
    "any.required": `"menuScheduleId" is a required field`,
    "string.pattern.base": `"menuScheduleId" must be a valid ObjectId`,
  }),
  foodId: Joi.string().pattern(objectIdRegex).required().messages({
    "any.required": `"foodId" is a required field`,
    "string.pattern.base": `"foodId" must be a valid ObjectId`,
  }),
  maxServing: Joi.number().integer().min(0).required().messages({
    "any.required": `"maxServing" is a required field`,
    "number.base": `"maxServing" must be a number`,
    "number.integer": `"maxServing" must be an integer`,
    "number.min": `"maxServing" cannot be negative`,
  }),
  isActive: Joi.boolean().optional(),
})
  .unknown(false)
  .messages({
    "object.unknown": `"BODY" contains keys that are not allowed (Mass Assignment Blocked)`,
  });

const createBulkMenuScheduleItemSchema = Joi.object({
  menuScheduleId: Joi.string().pattern(objectIdRegex).required().messages({
    "any.required": `"menuScheduleId" is a required field`,
    "string.pattern.base": `"menuScheduleId" must be a valid ObjectId`,
  }),
  items: Joi.array()
    .items(
      Joi.object({
        foodId: Joi.string().pattern(objectIdRegex).required().messages({
          "any.required": `"foodId" is a required field`,
          "string.pattern.base": `"foodId" must be a valid ObjectId`,
        }),
        maxServing: Joi.number().integer().min(0).required().messages({
          "any.required": `"maxServing" is a required field`,
          "number.base": `"maxServing" must be a number`,
          "number.integer": `"maxServing" must be an integer`,
          "number.min": `"maxServing" cannot be negative`,
        }),
        isActive: Joi.boolean().optional(),
      }).unknown(false)
    )
    .min(1)
    .required()
    .messages({
      "any.required": `"items" is a required field`,
      "array.min": `"items" must contain at least 1 item`,
    }),
})
  .unknown(false)
  .messages({
    "object.unknown": `"BODY" contains keys that are not allowed (Mass Assignment Blocked)`,
  });

const updateMenuScheduleItemSchema = Joi.object({
  maxServing: Joi.number().integer().min(0).optional().messages({
    "number.base": `"maxServing" must be a number`,
    "number.integer": `"maxServing" must be an integer`,
    "number.min": `"maxServing" cannot be negative`,
  }),
  isActive: Joi.boolean().optional(),
  __v: Joi.number().optional(),
})
  .unknown(false)
  .messages({
    "object.unknown": `"BODY" contains keys that are not allowed (Mass Assignment Blocked)`,
  });

module.exports = {
  createMenuScheduleItemSchema,
  createBulkMenuScheduleItemSchema,
  updateMenuScheduleItemSchema,
};
