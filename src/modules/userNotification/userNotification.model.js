const mongoose = require("mongoose");

const userNotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    notificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Notification",
      required: true,
      index: true,
    },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: { createdAt: "createdAt", updatedAt: false },
  },
);

userNotificationSchema.virtual("userNotificationId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("UserNotification", userNotificationSchema);
