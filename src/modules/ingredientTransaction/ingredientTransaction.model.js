const mongoose = require("mongoose");

const ingredientTransactionSchema = new mongoose.Schema(
  {
    ingredientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
      index: true,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IngredientBatch",
      required: false,
      index: true,
    },
    transactionType: { type: String },
    quantity: { type: Number, default: 0 },
    reason: { type: String, default: null },
    referenceType: { type: String },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
  },
);

ingredientTransactionSchema.virtual("ingredientTransactionId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model(
  "IngredientTransaction",
  ingredientTransactionSchema,
);
