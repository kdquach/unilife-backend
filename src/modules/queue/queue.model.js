const mongoose = require("mongoose");

const queueSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: false,
      unique: true,
      sparse: true,
      index: true,
    },
    queueNumber: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["WAITING", "SERVING", "DONE", "SKIPPED"],
      required: true,
      default: "WAITING",
      index: true,
    },
    scannedAt: { type: Date, default: null },
    servedAt: { type: Date, default: null },
    doneAt: { type: Date, default: null },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
  },
);

queueSchema.index({ status: 1, queueNumber: 1, scannedAt: 1 });

queueSchema.virtual("queueId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("Queue", queueSchema);
