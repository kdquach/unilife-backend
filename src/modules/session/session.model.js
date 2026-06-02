const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    token: { type: String },
    expiresAt: { type: Date, default: null },
    isRevoked: { type: Boolean, default: false, index: true },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: { createdAt: "createdAt", updatedAt: false },
  },
);

sessionSchema.virtual("sessionId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("Session", sessionSchema);
