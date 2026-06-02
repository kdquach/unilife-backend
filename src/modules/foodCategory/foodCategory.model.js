const mongoose = require("mongoose");

const foodCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
  },
);

foodCategorySchema.virtual("foodCategoryId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("FoodCategory", foodCategorySchema);
