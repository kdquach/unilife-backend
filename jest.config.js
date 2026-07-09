module.exports = {
  globalSetup: "<rootDir>/test/globalSetup.js",
  globalTeardown: "<rootDir>/test/globalTeardown.js",
  setupFilesAfterEnv: ["<rootDir>/test/setupFile.js"],
  testEnvironment: "node",
  testTimeout: 30000,
};
