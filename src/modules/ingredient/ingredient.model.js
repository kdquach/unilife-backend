const mongoose = require("mongoose");

const ingredientSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IngredientCategory",
      required: false,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    unit: { type: String },
    storageType: { type: String },
    minStockThreshold: { type: Number, default: 0 },
    currentStock: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
  },
);

ingredientSchema.virtual("ingredientId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("Ingredient", ingredientSchema);
