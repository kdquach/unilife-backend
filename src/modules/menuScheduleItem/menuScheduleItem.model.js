const mongoose = require("mongoose");

const menuScheduleItemSchema = new mongoose.Schema(
  {
    menuScheduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuSchedule",
      required: true,
      index: true,
    },
    foodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Food",
      required: false,
      index: true,
    },
    maxServing: { type: Number, default: 0 },
    reservedCount: { type: Number, default: 0 },
    servedCount: { type: Number, default: 0 },
    remainingCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
  },
);

menuScheduleItemSchema.virtual("menuScheduleItemId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("MenuScheduleItem", menuScheduleItemSchema);
