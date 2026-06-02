const mongoose = require("mongoose");

const foodIngredientSchema = new mongoose.Schema(
  {
    foodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Food",
      required: false,
      index: true,
    },
    ingredientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
      index: true,
    },
    quantityPerServing: { type: Number, default: null },
    unit: { type: String },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
  },
);

foodIngredientSchema.virtual("foodIngredientId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("FoodIngredient", foodIngredientSchema);
