const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: false,
      index: true,
    },
    menuScheduleItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuScheduleItem",
      required: false,
      index: true,
    },
    itemType: {
      type: String,
      enum: ["MENU_ITEM", "REGULAR_FOOD"],
      required: true,
      default: "MENU_ITEM",
    },
    foodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Food",
      required: false,
      index: true,
    },
    quantity: { type: Number, default: 0 },
    unitPrice: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: false,
  },
);

orderItemSchema.virtual("orderItemId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("OrderItem", orderItemSchema);
