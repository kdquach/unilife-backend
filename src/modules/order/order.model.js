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
    orderCode: { type: String, required: true, trim: true, unique: true },
    status: { type: String, required: true },
    totalPrice: { type: Number, default: 0 },
    paymentMethod: { type: String, required: true },
    paymentStatus: { type: String, required: true },
    isWalkIn: { type: Boolean, default: false, index: true },
    note: { type: String, trim: true, default: null },
    transferContent: { type: String, default: undefined },
    paymentInfo: {
      bankName: { type: String, default: null },
      accountNumber: { type: String, default: null },
      accountName: { type: String, default: null },
      qrCodeUrl: { type: String, default: null },
    },
    expiresAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    transactionRef: { type: String, default: null },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
  },
);

orderSchema.virtual("orderId").get(function () {
  return this._id?.toString();
});

orderSchema.virtual("pickupQrPayload").get(function () {
  const orderId = this._id?.toString();
  if (!orderId || !this.orderCode) return null;

  return JSON.stringify({
    type: "UNILIFE_PICKUP",
    orderId,
    orderCode: this.orderCode,
  });
});

orderSchema.virtual("items", {
  ref: "OrderItem",
  localField: "_id",
  foreignField: "orderId",
});

orderSchema.virtual("queue", {
  ref: "Queue",
  localField: "_id",
  foreignField: "orderId",
  justOne: true,
});

orderSchema.index(
  { transferContent: 1 },
  {
    unique: true,
    partialFilterExpression: { transferContent: { $type: "string" } },
  },
);
orderSchema.index({ paymentStatus: 1, expiresAt: 1 });

module.exports = mongoose.model("Order", orderSchema);
