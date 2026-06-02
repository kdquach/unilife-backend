const success = (res, data = null, message = "Success", statusCode = 200) => {
  return res.status(statusCode).json({ success: true, message, data });
};

const fail = (res, message = "Failed", statusCode = 400, errors = null) => {
  return res.status(statusCode).json({ success: false, message, errors });
};

module.exports = { success, fail };
