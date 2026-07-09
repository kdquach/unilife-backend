const { generateDescription } = require("../../src/middlewares/activityLog.middleware");

describe("ActivityLog Middleware Localization", () => {
  it("should generate English description for LOGIN", () => {
    const req = { body: {} };
    const desc = generateDescription("LOGIN", req);
    expect(desc).toBe("Logged into the system");
  });

  it("should generate English description for CREATE_USER", () => {
    const req = { body: { fullName: "John", email: "john@test.com", role: "ADMIN" } };
    const desc = generateDescription("CREATE_USER", req);
    expect(desc).toBe("Created new user account: John (john@test.com) with role ADMIN");
  });
});
