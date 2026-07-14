const Joi = require("joi");

const createMenuScheduleSchema = Joi.object({
  date: Joi.date().iso().required().messages({
    "date.base": `"date" must be a valid date string`,
    "date.format": `"date" must be in ISO format`,
    "any.required": `"date" is a required field`,
  }),
})
  .unknown(false)
  .messages({
    "object.unknown": `"BODY" contains keys that are not allowed (Mass Assignment Blocked)`,
  });

const updateMenuScheduleSchema = Joi.object({
  date: Joi.date().iso().optional().messages({
    "date.base": `"date" must be a valid date string`,
    "date.format": `"date" must be in ISO format`,
  }),
  status: Joi.string()
    .valid("DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED")
    .optional()
    .messages({
      "any.only": `"status" must be one of [DRAFT, PUBLISHED, CANCELLED, COMPLETED]`,
    }),
  __v: Joi.number().optional(),
})
  // Ban any other keys from req.body (Mass Assignment Defense Layer 1)
  .unknown(false)
  .messages({
    "object.unknown": `"BODY" contains keys that are not allowed (Mass Assignment Blocked)`,
  });

module.exports = {
  createMenuScheduleSchema,
  updateMenuScheduleSchema,
};
