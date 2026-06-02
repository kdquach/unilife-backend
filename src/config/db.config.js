const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is missing");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB Atlas connected");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
