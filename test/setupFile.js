const mongoose = require("mongoose");

beforeAll(async () => {
  if (process.env.MONGO_URI) {
    const workerId = process.env.JEST_WORKER_ID || "1";
    const uri = new URL(process.env.MONGO_URI);
    uri.pathname = `/test_worker_${workerId}`;
    await mongoose.connect(uri.toString());
  }
});

afterAll(async () => {
  await mongoose.disconnect();
});
