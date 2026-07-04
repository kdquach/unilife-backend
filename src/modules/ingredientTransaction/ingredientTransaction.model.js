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
    stockBefore: { type: Number, default: null },
    stockAfter: { type: Number, default: null },
    unit: { type: String, default: null },
    reason: { type: String, default: null },
    adjustedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    referenceType: { type: String },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
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
