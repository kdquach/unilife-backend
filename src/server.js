require("dotenv").config();
const http = require("http");
const app = require("./app");
const connectDB = require("./config/db.config");
const { initSocket } = require("./socket");

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
initSocket(server);

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`UniLife API is running on port ${PORT}`);
  });
});
