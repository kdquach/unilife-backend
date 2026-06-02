const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!req.user)
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    if (!roles.includes(req.user.role))
      return res
        .status(403)
        .json({ success: false, message: "Permission denied" });
    next();
  };
module.exports = { authorize };
