const jwt = require("jsonwebtoken");

describe("JWT utility", () => {
  const originalAccessSecret = process.env.JWT_ACCESS_SECRET;
  const originalAccessExpiry = process.env.JWT_ACCESS_EXPIRES_IN;

  afterEach(() => {
    process.env.JWT_ACCESS_SECRET = originalAccessSecret;
    process.env.JWT_ACCESS_EXPIRES_IN = originalAccessExpiry;
    jest.resetModules();
  });

  it("issues access tokens that remain valid for 24 hours", () => {
    process.env.JWT_ACCESS_SECRET = "test-access-secret";
    process.env.JWT_ACCESS_EXPIRES_IN = "24h";
    const { signAccessToken } = require("./jwt.util");

    const token = signAccessToken({ userId: "user-1", role: "KITCHEN_STAFF" });
    const payload = jwt.decode(token);

    expect(payload.exp - payload.iat).toBe(24 * 60 * 60);
  });
});
