const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const routes = require("../../routes");
const User = require("../user/user.model");
const Supplier = require("./supplier.model");
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
  await Supplier.deleteMany({});
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

describe("Supplier Routes (POST / PATCH / GET / DELETE)", () => {
  let managerToken;

  beforeEach(async () => {
    managerToken = (await createTestUser(ROLES.MANAGER)).token;
  });

  describe("POST /api/v1/suppliers", () => {
    it("should successfully create a unique supplier", async () => {
      const res = await request(app)
        .post("/api/v1/suppliers")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          name: "Fresh Farm Co.",
          phone: "0901234567",
          address: "123 Main St",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Fresh Farm Co.");
    });

    it("should reject creation of supplier with duplicate name (case insensitive)", async () => {
      await Supplier.create({ name: "Fresh Farm Co.", phone: "0901234567" });

      const res = await request(app)
        .post("/api/v1/suppliers")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          name: "fresh farm co.",
          phone: "0987654321",
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain("name already exists");
    });

    it("should reject creation of supplier with duplicate phone number", async () => {
      await Supplier.create({ name: "Fresh Farm Co.", phone: "0901234567" });

      const res = await request(app)
        .post("/api/v1/suppliers")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          name: "Other Farm Co.",
          phone: "0901234567",
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain("phone number already exists");
    });
  });

  describe("PATCH /api/v1/suppliers/:id", () => {
    it("should allow updating without duplicate check conflicts on the same supplier", async () => {
      const s = await Supplier.create({ name: "Fresh Farm Co.", phone: "0901234567" });

      const res = await request(app)
        .patch(`/api/v1/suppliers/${s._id}`)
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          name: "Fresh Farm Co.", // Same name
          phone: "0901234567", // Same phone
          address: "New Address",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.address).toBe("New Address");
    });

    it("should reject updating to an existing supplier's name", async () => {
      const s1 = await Supplier.create({ name: "Fresh Farm Co.", phone: "0901234567" });
      const s2 = await Supplier.create({ name: "Other Farm Co.", phone: "0987654321" });

      const res = await request(app)
        .patch(`/api/v1/suppliers/${s2._id}`)
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          name: "fresh farm co.",
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain("name already exists");
    });
  });
});
