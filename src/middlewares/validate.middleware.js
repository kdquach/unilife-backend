const Joi = require("joi");

const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    const err = new Error(errorMessages.join(", "));
    err.statusCode = 422;
    return next(err);
  }
  next();
};

module.exports = { validate };
