const asyncHandler = require("../../utils/asyncHandler");
const { success, fail } = require("../../utils/apiResponse");
const paymentService = require("./payment.service");

/**
 * Handle SePay webhook notification
 * POST /api/v1/payments/sepay/webhook
 * Auth: SePay API key (not user JWT)
 */
const handleSepayWebhook = asyncHandler(async (req, res) => {
  // Verify SePay authorization
  const authHeader = req.headers.authorization;
  if (!paymentService.verifyWebhookAuth(authHeader)) {
    return fail(res, "Unauthorized webhook request", 401);
  }

  const result = await paymentService.processWebhook(req.body);
  return success(res, result, "Webhook processed successfully");
});

/**
 * Expire pending orders (admin/system endpoint)
 * POST /api/v1/payments/expire-pending
 */
const expirePendingOrders = asyncHandler(async (req, res) => {
  const result = await paymentService.expirePendingOrders();
  return success(res, result, "Pending orders expired successfully");
});

module.exports = { handleSepayWebhook, expirePendingOrders };
