const mongoose = require("mongoose");

const foodSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodCategory",
      required: false,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    imageUrl: { type: String, default: null },
    price: { type: Number, default: 0 },
    // true  = sold via menu schedule (MenuScheduleItem)
    // false = daily menu item (always available)
    isMenuItem: { type: Boolean, default: false, index: true },
    // Daily inventory stock - only used for daily items (isMenuItem: false)
    stockQuantity: { type: Number, default: null },
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
  },
);

foodSchema.virtual("foodId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("Food", foodSchema);
