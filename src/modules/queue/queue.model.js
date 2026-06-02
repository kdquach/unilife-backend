const mongoose = require("mongoose");

const queueSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: false,
      index: true,
    },
    queueNumber: { type: Number, default: 0 },
    status: { type: String, required: true },
    calledAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: { createdAt: "createdAt", updatedAt: false },
  },
);

queueSchema.virtual("queueId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("Queue", queueSchema);
