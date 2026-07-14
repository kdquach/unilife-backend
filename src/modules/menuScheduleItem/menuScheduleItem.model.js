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
      required: true,
      index: true,
    },
    maxServing: { type: Number, default: 0, min: 0 },
    reservedCount: { type: Number, default: 0, min: 0 },
    servedCount: { type: Number, default: 0, min: 0 },
    remainingCount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
    deductedBatches: [
      {
        ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: "Ingredient" },
        batchId: { type: mongoose.Schema.Types.ObjectId, ref: "IngredientBatch" },
        quantity: { type: Number },
      },
    ],
    recipeSnapshot: [
      {
        ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: "Ingredient" },
        quantityPerServing: { type: Number },
      },
    ],
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
    optimisticConcurrency: true,
  },
);

menuScheduleItemSchema.index({ menuScheduleId: 1, foodId: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

menuScheduleItemSchema.virtual("menuScheduleItemId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("MenuScheduleItem", menuScheduleItemSchema);
