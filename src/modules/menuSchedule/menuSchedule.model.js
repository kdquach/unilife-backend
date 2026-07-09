const mongoose = require("mongoose");

const menuScheduleSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: ["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"],
      default: "DRAFT",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    publishedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
    optimisticConcurrency: true,
  },
);

menuScheduleSchema.index({ date: -1, status: 1 });
menuScheduleSchema.index(
  { date: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

menuScheduleSchema.pre("save", function (next) {
  if (this.status === "CANCELLED") {
    this.isActive = false;
  }
  next();
});

menuScheduleSchema.virtual("menuScheduleId").get(function () {
  return this._id.toString();
});

menuScheduleSchema.virtual("items", {
  ref: "MenuScheduleItem",
  localField: "_id",
  foreignField: "menuScheduleId",
});

module.exports = mongoose.model("MenuSchedule", menuScheduleSchema);

