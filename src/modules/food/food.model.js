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
    isMenuItem: { type: Boolean, default: false, index: true },
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
