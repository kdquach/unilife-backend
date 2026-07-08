module.exports = async function () {
  if (global.__MONGOINSTANCE) {
    await global.__MONGOINSTANCE.stop();
  }
};
