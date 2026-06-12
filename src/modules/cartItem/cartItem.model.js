const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    cartId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cart",
      required: true,
      index: true,
    },
    menuScheduleItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuScheduleItem",
      required: false,
      index: true,
    },
    foodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Food",
      required: false,
      index: true,
    },
    quantity: { type: Number, default: 0 },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
  },
);

cartItemSchema.index(
  { cartId: 1, menuScheduleItemId: 1 },
  { unique: true, partialFilterExpression: { menuScheduleItemId: { $exists: true } } }
);

cartItemSchema.index(
  { cartId: 1, foodId: 1 },
  { unique: true, partialFilterExpression: { foodId: { $exists: true } } }
);

cartItemSchema.virtual("cartItemId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("CartItem", cartItemSchema);
