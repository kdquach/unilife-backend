const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    code: { type: String, required: true },
    purpose: { type: String, required: true },
    isUsed: { type: Boolean, default: false, index: true },
    expiresAt: { type: Date, default: null },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: { createdAt: "createdAt", updatedAt: false },
  },
);

otpSchema.virtual("otpId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("OTP", otpSchema);
