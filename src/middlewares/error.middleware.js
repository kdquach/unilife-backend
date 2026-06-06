const notFoundHandler = (req, res, next) => {
  res
    .status(404)
    .json({ success: false, message: `Route not found: ${req.originalUrl}` });
};

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";
  let errors = null;

  // Handle Mongoose validation errors
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = "Validation Error";
    errors = Object.keys(err.errors).reduce((acc, key) => {
      acc[key] = err.errors[key].message;
      return acc;
    }, {});
  }

  // Handle Mongoose cast errors (invalid ObjectIds)
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid format for field ${err.path}`;
  }

  // Handle Mongoose duplicate key errors
  if (err.code === 11000) {
    statusCode = 409;
    const key = Object.keys(err.keyValue)[0];
    message = `Duplicate field value entered: ${key}`;
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
};

module.exports = { notFoundHandler, errorHandler };
