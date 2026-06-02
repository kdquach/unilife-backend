const mongoose = require("mongoose");

const ingredientCategorySchema = new mongoose.Schema(
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

ingredientCategorySchema.virtual("ingredientCategoryId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("IngredientCategory", ingredientCategorySchema);
