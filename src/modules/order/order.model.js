const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    orderCode: { type: String, required: true, trim: true },
    status: { type: String, required: true },
    totalPrice: { type: Number, default: 0 },
    paymentMethod: { type: String, required: true },
    paymentStatus: { type: String, required: true },
    isWalkIn: { type: Boolean, default: false, index: true },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
  },
);

orderSchema.virtual("orderId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("Order", orderSchema);
