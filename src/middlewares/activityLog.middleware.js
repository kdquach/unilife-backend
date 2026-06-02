const ActivityLog = require("../modules/activityLogs/activityLog.model");

const writeActivityLog =
  (action, targetType = null) =>
  async (req, res, next) => {
    res.on("finish", async () => {
      try {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          await ActivityLog.create({
            userId: req.user?._id,
            action,
            targetType,
            targetId: req.params.id,
            description: `${req.method} ${req.originalUrl}`,
            ipAddress: req.ip,
          });
        }
      } catch (err) {
        console.error("Activity log failed:", err.message);
      }
    });
    next();
  };
module.exports = { writeActivityLog };
