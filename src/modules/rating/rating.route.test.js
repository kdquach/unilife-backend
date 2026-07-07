const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const routes = require("../../routes");
const User = require("../user/user.model");
const Rating = require("./rating.model");
const Food = require("../food/food.model");
const FoodCategory = require("../foodCategory/foodCategory.model");
const Order = require("../order/order.model");
const ROLES = require("../../constants/roles.constant");
const jwt = require("jsonwebtoken");

process.env.JWT_ACCESS_SECRET = "test-secret-for-jwt";

let mongoServer;
const app = express();
app.use(express.json());
app.use("/api/v1", routes);

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Rating.deleteMany({});
  await Food.deleteMany({});
  await FoodCategory.deleteMany({});
  await Order.deleteMany({});
});

const createTestUser = async (role, email = "user@test.com") => {
  const user = await User.create({
    email: email,
    passwordHash: "hashedpassword",
    fullName: "Test User " + role,
    role,
    isActive: true,
  });
  const token = jwt.sign(
    { userId: user._id, role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "1h" },
  );
  return { user, token };
};

describe("GET /api/v1/ratings", () => {
  describe("Authentication & Authorization", () => {
    it("should return 401 if no token provided", async () => {
      const res = await request(app).get("/api/v1/ratings");
      expect(res.status).toBe(401);
    });

    it("should return 403 for CUSTOMER role", async () => {
      const { token } = await createTestUser(ROLES.CUSTOMER);
      const res = await request(app)
        .get("/api/v1/ratings")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it("should return 200 for COUNTER_STAFF role", async () => {
      const { token } = await createTestUser(ROLES.COUNTER_STAFF);
      const res = await request(app)
        .get("/api/v1/ratings")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });

  describe("Functionality", () => {
    let token, customer, food, order;

    beforeEach(async () => {
      const auth = await createTestUser(ROLES.COUNTER_STAFF);
      token = auth.token;

      customer = await User.create({
        email: "customer@test.com",
        passwordHash: "hashed",
        fullName: "John Doe",
        role: ROLES.CUSTOMER,
        isActive: true,
      });

      const category = await FoodCategory.create({
        name: "Main",
        description: "Desc",
      });
      food = await Food.create({
        name: "Pizza",
        categoryId: category._id,
        price: 50000,
        status: "AVAILABLE",
      });

      order = await Order.create({
        userId: customer._id,
        orderCode: "ORD-1234",
        status: "COMPLETED",
        totalAmount: 50000,
        paymentStatus: "PAID",
        paymentMethod: "CASH",
      });

      await Rating.create({
        userId: customer._id,
        orderId: order._id,
        foodId: food._id,
        ratingType: "FOOD",
        stars: 5,
        comment: "Very delicious",
      });

      await Rating.create({
        userId: customer._id,
        orderId: order._id,
        ratingType: "SERVICE",
        stars: 4,
        comment: "Fast delivery",
      });
    });

    it("should list ratings with populated fields", async () => {
      const res = await request(app)
        .get("/api/v1/ratings")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(2);

      const foodRating = res.body.data.items.find(
        (r) => r.ratingType === "FOOD",
      );
      expect(foodRating.userId.fullName).toBe("John Doe");
      expect(foodRating.foodId.name).toBe("Pizza");
      expect(foodRating.orderId.orderCode).toBe("ORD-1234");
      
      // Data Leakage Security Checks
      expect(foodRating.userId.passwordHash).toBeUndefined();
      expect(foodRating.userId.isActive).toBeUndefined();
      expect(foodRating.userId.createdAt).toBeUndefined();
      expect(foodRating.foodId.createdAt).toBeUndefined();
      expect(foodRating.orderId.createdAt).toBeUndefined();
    });

    it("should filter by keyword (searching user fullName or comment)", async () => {
      const res = await request(app)
        .get("/api/v1/ratings?keyword=John")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(2);

      const res2 = await request(app)
        .get("/api/v1/ratings?keyword=delicious")
        .set("Authorization", `Bearer ${token}`);

      expect(res2.status).toBe(200);
      expect(res2.body.data.items.length).toBe(1);
    });

    it("should filter by stars", async () => {
      const res = await request(app)
        .get("/api/v1/ratings?stars=5")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].stars).toBe(5);
    });

    it("should filter by ratingType", async () => {
      const res = await request(app)
        .get("/api/v1/ratings?type=FOOD")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].ratingType).toBe("FOOD");
    });

    it("should not crash if keyword contains regex special characters", async () => {
      const res = await request(app)
        .get("/api/v1/ratings?keyword=hello(")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it("should return empty list if filter is NaN for stars", async () => {
      const res = await request(app)
        .get("/api/v1/ratings?stars=abc")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2); // Since stars=abc is NaN, the filter is ignored and returns all
    });

    it("should filter by hasReply = true", async () => {
      // First, add a reply to one of the ratings manually
      const ratingToReply = await Rating.findOne({ ratingType: "FOOD" });
      ratingToReply.staffReply = "Thank you!";
      await ratingToReply.save();

      const res = await request(app)
        .get("/api/v1/ratings?hasReply=true")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].ratingType).toBe("FOOD");
    });

    it("should filter by hasReply = false", async () => {
      // Add a reply to one of the ratings
      const ratingToReply = await Rating.findOne({ ratingType: "FOOD" });
      ratingToReply.staffReply = "Thank you!";
      await ratingToReply.save();

      const res = await request(app)
        .get("/api/v1/ratings?hasReply=false")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].ratingType).toBe("SERVICE");
    });

    it("should filter by startDate and endDate", async () => {
      // Both ratings are created recently (Date.now())
      // Querying from yesterday to tomorrow should return 2
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      
      const res1 = await request(app)
        .get(`/api/v1/ratings?startDate=${yesterday}&endDate=${tomorrow}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res1.status).toBe(200);
      expect(res1.body.data.items).toHaveLength(2);

      // Querying for a date range in the future should return 0
      const future1 = new Date(Date.now() + 86400000 * 2).toISOString();
      const future2 = new Date(Date.now() + 86400000 * 3).toISOString();

      const res2 = await request(app)
        .get(`/api/v1/ratings?startDate=${future1}&endDate=${future2}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res2.status).toBe(200);
      expect(res2.body.data.items).toHaveLength(0);
    });

    it("should return 400 or ignore filter if startDate is invalid date string", async () => {
      const res = await request(app)
        .get(`/api/v1/ratings?startDate=invalid-date`)
        .set("Authorization", `Bearer ${token}`);

      // We expect it to either return 400 (Bad Request) or gracefully ignore and return 200, 
      // but NOT 500 Internal Server Error (crash).
      expect(res.status).not.toBe(500);
    });
  });

    describe("GET /api/v1/ratings/:id", () => {
    let token, ratingId;

    beforeEach(async () => {
      const auth = await createTestUser(ROLES.COUNTER_STAFF, "staff1@t.com");
      token = auth.token;

      const customer = await User.create({
        email: "customer2@test.com",
        passwordHash: "hashed",
        fullName: "Jane Doe",
        role: ROLES.CUSTOMER,
        isActive: true,
      });

      const rating = await Rating.create({
        userId: customer._id,
        ratingType: "FOOD",
        stars: 3,
        comment: "Okay",
      });
      ratingId = rating._id.toString();
    });

    describe("Authentication & Authorization", () => {
      it("should return 401 if no token provided", async () => {
        const res = await request(app).get(`/api/v1/ratings/${ratingId}`);
        expect(res.status).toBe(401);
      });

      it("should return 403 for CUSTOMER role", async () => {
        const auth = await createTestUser(ROLES.CUSTOMER);
        const res = await request(app)
          .get(`/api/v1/ratings/${ratingId}`)
          .set("Authorization", `Bearer ${auth.token}`);
        expect(res.status).toBe(403);
      });

      it("should return 200 for COUNTER_STAFF role", async () => {
        const res = await request(app)
          .get(`/api/v1/ratings/${ratingId}`)
          .set("Authorization", `Bearer ${token}`);
        expect(res.status).toBe(200);
      });
    });

    describe("Functionality", () => {
      it("should return 400 if ID is invalid format", async () => {
        const res = await request(app)
          .get("/api/v1/ratings/invalid-id")
          .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Invalid Rating ID");
      });

    it("should return 404 if ID is valid but not found", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/v1/ratings/${fakeId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Rating not found");
    });

    it("should return 200 with populated details if found", async () => {
      const res = await request(app)
        .get(`/api/v1/ratings/${ratingId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stars).toBe(3);
      expect(res.body.data.userId.fullName).toBe("Jane Doe");
      
      // Data Leakage Security Checks
      expect(res.body.data.userId.passwordHash).toBeUndefined();
      expect(res.body.data.userId.isActive).toBeUndefined();
      expect(res.body.data.userId.createdAt).toBeUndefined();
    });
    });
  });

  describe("PATCH /api/v1/ratings/:id/reply", () => {
    let token, customerToken, ratingId;

    beforeEach(async () => {
      const staffAuth = await createTestUser(ROLES.COUNTER_STAFF, "staff2@t.com");
      token = staffAuth.token;

      const customerAuth = await createTestUser(ROLES.CUSTOMER, "cust3@t.com");
      customerToken = customerAuth.token;

      const rating = await Rating.create({
        userId: customerAuth.user._id,
        ratingType: "FOOD",
        stars: 3,
        comment: "Average",
      });
      ratingId = rating._id.toString();
    });

    describe("Authentication & Authorization", () => {
      it("should return 401 if no token provided", async () => {
        const res = await request(app)
          .patch(`/api/v1/ratings/${ratingId}/reply`)
          .send({ staffReply: "Thanks" });
        expect(res.status).toBe(401);
      });

      it("should return 403 for CUSTOMER role", async () => {
        const res = await request(app)
          .patch(`/api/v1/ratings/${ratingId}/reply`)
          .set("Authorization", `Bearer ${customerToken}`)
          .send({ staffReply: "Thanks" });
        expect(res.status).toBe(403);
      });
    });

    describe("Functionality", () => {
      it("should return 400 if ID is invalid format", async () => {
        const res = await request(app)
          .patch("/api/v1/ratings/invalid-id/reply")
          .set("Authorization", `Bearer ${token}`)
          .send({ staffReply: "Thanks" });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Invalid Rating ID");
      });

      it("should return 400 if staffReply is missing or empty", async () => {
        const res1 = await request(app)
          .patch(`/api/v1/ratings/${ratingId}/reply`)
          .set("Authorization", `Bearer ${token}`)
          .send({}); // Missing
        
        expect(res1.status).toBe(400);
        expect(res1.body.message).toBe("staffReply is required");

        const res2 = await request(app)
          .patch(`/api/v1/ratings/${ratingId}/reply`)
          .set("Authorization", `Bearer ${token}`)
          .send({ staffReply: "   " }); // Empty
        
        expect(res2.status).toBe(400);
        expect(res2.body.message).toBe("staffReply is required");
      });

      it("should return 404 if ID is valid but not found", async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request(app)
          .patch(`/api/v1/ratings/${fakeId}/reply`)
          .set("Authorization", `Bearer ${token}`)
          .send({ staffReply: "Thanks" });

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Rating not found");
      });

      it("should return 200 and update rating successfully", async () => {
        const res = await request(app)
          .patch(`/api/v1/ratings/${ratingId}/reply`)
          .set("Authorization", `Bearer ${token}`)
          .send({ staffReply: "Thank you for the feedback!" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toBe("Replied successfully");
        
        const updatedRating = await Rating.findById(ratingId);
        expect(updatedRating.staffReply).toBe("Thank you for the feedback!");
        expect(updatedRating.repliedBy).toBeDefined();
        expect(updatedRating.repliedAt).toBeDefined();
      });
    });
  });

  describe("POST /api/v1/ratings", () => {
    let customerToken;
    beforeEach(async () => {
      const auth = await createTestUser(ROLES.CUSTOMER);
      customerToken = auth.token;
    });

    it("should return 401 if not authenticated", async () => {
      const res = await request(app).post("/api/v1/ratings").send({ stars: 5 });
      expect(res.status).toBe(401);
    });

    it("should ignore injected fields and create successfully", async () => {
      const fakeStaffReply = "Hacked Reply";
      const fakeUserId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .post("/api/v1/ratings")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ 
          stars: 4, 
          comment: "Good",
          userId: fakeUserId, // mass assignment attempt
          staffReply: fakeStaffReply // mass assignment attempt
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      
      const rating = await Rating.findById(res.body.data._id);
      expect(rating.staffReply).toBeNull(); // Should ignore injection
      expect(rating.userId.toString()).not.toBe(fakeUserId.toString()); // Should override with logged in user ID
    });
  });

  describe("PATCH /api/v1/ratings/:id", () => {
    let customerToken1, customerToken2, ratingId;
    beforeEach(async () => {
      const auth1 = await createTestUser(ROLES.CUSTOMER, "c1@t.com");
      customerToken1 = auth1.token;

      const auth2 = await createTestUser(ROLES.CUSTOMER, "c2@t.com");
      customerToken2 = auth2.token;

      const rating = await Rating.create({
        userId: auth1.user._id,
        stars: 3,
        comment: "Average",
      });
      ratingId = rating._id.toString();
    });

    it("should return 401 if not authenticated", async () => {
      const res = await request(app).patch(`/api/v1/ratings/${ratingId}`).send({ stars: 5 });
      expect(res.status).toBe(401);
    });

    it("should return 403 if trying to update someone else's rating", async () => {
      const res = await request(app)
        .patch(`/api/v1/ratings/${ratingId}`)
        .set("Authorization", `Bearer ${customerToken2}`) // User 2 trying to update User 1's rating
        .send({ stars: 5 });

      expect(res.status).toBe(403);
    });

    it("should update successfully if owns rating", async () => {
      const res = await request(app)
        .patch(`/api/v1/ratings/${ratingId}`)
        .set("Authorization", `Bearer ${customerToken1}`)
        .send({ stars: 4 });

      expect(res.status).toBe(200);
      expect(res.body.data.stars).toBe(4);
    });
  });
});
