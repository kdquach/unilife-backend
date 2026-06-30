const request = require("supertest");
const express = require("express");
const routes = require("../../routes");

const app = express();
app.use(express.json());
app.use("/api/v1", routes);

describe("Payment Routes", () => {
  it("should match POST /api/v1/sepay-payment perfectly (Fix 404 trailing slash issue)", async () => {
    // We send a POST request without Auth to see if it reaches the controller and returns 401 instead of 404
    const res = await request(app).post("/api/v1/sepay-payment").send({});
    // If routing works, it should hit the controller and fail at auth (401), NOT 404.
    expect(res.status).toBe(401);
  });
});
