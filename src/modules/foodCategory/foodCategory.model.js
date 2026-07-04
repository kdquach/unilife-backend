const mongoose = require("mongoose");

const foodCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
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

foodCategorySchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model("FoodCategory", foodCategorySchema);
