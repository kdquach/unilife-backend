const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const routes = require("../../routes");
const User = require("../user/user.model");
const ActivityLog = require("./activityLog.model");
const ROLES = require("../../constants/roles.constant");
const jwt = require("jsonwebtoken");

process.env.JWT_ACCESS_SECRET = "test-secret-for-jwt";

const { errorHandler } = require("../../middlewares/error.middleware");
const app = express();
app.use(express.json());
app.use("/api/v1", routes);
app.use(errorHandler);

beforeEach(async () => {
  await User.deleteMany({});
  await ActivityLog.deleteMany({});
});

const createTestUser = async (role) => {
  const user = await User.create({
    email: `${role.toLowerCase()}@test.com`,
    passwordHash: "hashedpassword",
    fullName: "Test User",
    role,
    isActive: true,
  });
  const token = jwt.sign({ userId: user._id, role }, process.env.JWT_ACCESS_SECRET, { expiresIn: "1h" });
  return { user, token };
};

describe("ActivityLog Routes Authentication & Authorization", () => {
  describe("GET /api/v1/activity-logs", () => {
    it("should return 401 if unauthorized (no token)", async () => {
      const res = await request(app).get("/api/v1/activity-logs");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should return 403 if user is a CUSTOMER (unauthorized role)", async () => {
      const { token } = await createTestUser(ROLES.CUSTOMER);
      const res = await request(app)
        .get("/api/v1/activity-logs")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it("should return 403 if user is a KITCHEN_STAFF (unauthorized role)", async () => {
      const { token } = await createTestUser(ROLES.KITCHEN_STAFF);
      const res = await request(app)
        .get("/api/v1/activity-logs")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it("should return 200 for allowed roles: ADMIN", async () => {
      const { token } = await createTestUser(ROLES.ADMIN);
      const res = await request(app)
        .get("/api/v1/activity-logs")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should return 200 for allowed roles: MANAGER", async () => {
      const { token } = await createTestUser(ROLES.MANAGER);
      const res = await request(app)
        .get("/api/v1/activity-logs")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
