const mongoose = require("mongoose");

const ingredientBatchSchema = new mongoose.Schema(
  {
    ingredientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
      index: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: false,
      index: true,
    },
    quantity: { type: Number, default: 0 },
    unitPrice: { type: Number, default: 0 },
    expiryDate: { type: Date, default: null },
    remainingQuantity: { type: Number, default: 0 },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
  },
);

ingredientBatchSchema.virtual("ingredientBatchId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("IngredientBatch", ingredientBatchSchema);
