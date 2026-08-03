jest.mock("../../utils/email.util", () => ({
  sendForgotPasswordOtp: jest.fn(),
  sendRegistrationOtp: jest.fn(),
}));

const authService = require("./auth.service");
const User = require("../user/user.model");
const OTP = require("../otp/otp.model");
const ROLES = require("../../constants/roles.constant");
const { sendForgotPasswordOtp } = require("../../utils/email.util");

const createUser = (email, role) =>
  User.create({
    fullName: "Password Reset Test",
    email,
    passwordHash: "hashed-password",
    role,
    isActive: true,
    isEmailVerified: true,
  });

describe("Auth Service - Dashboard Password Reset", () => {
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), OTP.deleteMany({})]);
    sendForgotPasswordOtp.mockReset();
  });

  it("does not issue an OTP to a customer from the dashboard", async () => {
    await createUser("customer@unilife.local", ROLES.CUSTOMER);

    await expect(
      authService.requestForgotPasswordOtp({
        email: "customer@unilife.local",
        audience: "DASHBOARD",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(sendForgotPasswordOtp).not.toHaveBeenCalled();
    expect(await OTP.countDocuments({})).toBe(0);
  });

  it("issues an OTP to an eligible staff account", async () => {
    await createUser("manager@unilife.local", ROLES.MANAGER);

    await authService.requestForgotPasswordOtp({
      email: "manager@unilife.local",
      audience: "DASHBOARD",
    });

    expect(sendForgotPasswordOtp).toHaveBeenCalledTimes(1);
    expect(await OTP.countDocuments({ purpose: "FORGOT_PASSWORD" })).toBe(1);
  });

  it("keeps the customer password reset flow available outside dashboard", async () => {
    await createUser("customer@unilife.local", ROLES.CUSTOMER);

    await authService.requestForgotPasswordOtp({
      email: "customer@unilife.local",
    });

    expect(sendForgotPasswordOtp).toHaveBeenCalledTimes(1);
  });
});
