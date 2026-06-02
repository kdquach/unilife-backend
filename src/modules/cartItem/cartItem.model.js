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
      required: true,
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

cartItemSchema.virtual("cartItemId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("CartItem", cartItemSchema);
