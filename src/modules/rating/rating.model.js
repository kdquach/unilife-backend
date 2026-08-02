const mongoose = require("mongoose");

const ratingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: false,
      index: true,
    },
    foodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Food",
      required: false,
      index: true,
    },
    orderItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderItem",
      required: false,
      index: true,
    },
    ratingType: { type: String },
    stars: { type: Number, default: 0 },
    comment: { type: String, trim: true, maxlength: 500, default: null },
    isEdited: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    staffReply: { type: String, default: null },
    repliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    repliedAt: { type: Date, default: null },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
  },
);

ratingSchema.virtual("ratingId").get(function () {
  return this._id.toString();
});

ratingSchema.index(
  { userId: 1, orderItemId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      orderItemId: { $type: "objectId" },
    },
  },
);

module.exports = mongoose.model("Rating", ratingSchema);
