const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contactName: { type: String, default: null },
    phone: { type: String, trim: true, default: null },
    address: { type: String, default: null },
    note: { type: String, default: null },
    isActive: { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
  },
);

supplierSchema.virtual("supplierId").get(function () {
  return this._id.toString();
});

module.exports = mongoose.model("Supplier", supplierSchema);
