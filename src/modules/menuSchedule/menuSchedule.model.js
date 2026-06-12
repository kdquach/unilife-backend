const mongoose = require("mongoose");

const menuScheduleSchema = new mongoose.Schema(
  {
    date: { type: Date, default: null },
    status: { type: String, required: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    publishedAt: { type: Date, default: null },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
  },
);

menuScheduleSchema.virtual("menuScheduleId").get(function () {
  return this._id.toString();
});

menuScheduleSchema.virtual("items", {
  ref: "MenuScheduleItem",
  localField: "_id",
  foreignField: "menuScheduleId",
});

module.exports = mongoose.model("MenuSchedule", menuScheduleSchema);

