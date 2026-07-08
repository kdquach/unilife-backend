const { MongoMemoryReplSet } = require("mongodb-memory-server");

module.exports = async function () {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = replSet.getUri();
  global.__MONGOINSTANCE = replSet;
};
