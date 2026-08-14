require("dotenv").config();
const http = require("http");
const app = require("./app");
const connectDB = require("./config/db.config");
const { initSocket } = require("./socket");
const OrderService = require("./modules/order/order.service");

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
initSocket(server);

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`UniLife API is running on port ${PORT}`);
  });

  // DISABLED: Auto-cancelling stale orders to prevent cancelling active payment orders
  // Only frontend trigger when countdown expires
  /*
  setInterval(async () => {
    try {
      const result = await OrderService.checkExpiredOrders();
      if (result.processed > 0) {
        console.log(`[Order Expiry Check] Processed ${result.processed} expired orders`);
      }
    } catch (error) {
      console.error("[Order Expiry Check] Error:", error);
    }
  }, 60 * 1000); // Run every minute
  */
  console.log("[Order Expiry Check] DISABLED - Frontend only trigger");
});
