const Joi = require("joi");

const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    // Create errors object by field (take first error for each field)
    const errors = {};
    error.details.forEach((detail) => {
      const field = detail.path[0];
      if (!errors[field]) {
        errors[field] = detail.message;
      }
    });

    const unknownFieldError = error.details.find(
      (detail) => detail.type === "object.unknown",
    );
    const err = new Error(
      unknownFieldError
        ? `Validation failed: ${unknownFieldError.message}`
        : "Validation failed",
    );
    err.statusCode = 422;
    err.errors = errors;
    return next(err);
  }
  next();
};

module.exports = { validate };
