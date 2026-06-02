const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    action: { type: String, required: true },
    targetType: { type: String },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
    description: { type: String, default: null },
    ipAddress: { type: String },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: { createdAt: "createdAt", updatedAt: false },
  },
);

activityLogSchema.virtual("activityLogId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("ActivityLog", activityLogSchema);
