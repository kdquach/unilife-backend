require("dotenv").config();
const app = require("./app");
const connectDB = require("./config/db.config");

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`UniLife API is running on port ${PORT}`);
  });
});
