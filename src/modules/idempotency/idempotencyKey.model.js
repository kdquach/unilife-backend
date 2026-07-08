const mongoose = require("mongoose");

const idempotencyKeySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    responseStatus: { type: Number, default: null },
    responseBody: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, expires: 86400 }, // TTL index 24h
  },
  { timestamps: false }
);

module.exports = mongoose.model("IdempotencyKey", idempotencyKeySchema);
