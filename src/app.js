const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const routes = require("./routes");
const {
  notFoundHandler,
  errorHandler,
} = require("./middlewares/error.middleware");

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.use(
  "/uploads",
  express.static(
    path.join(process.cwd(), process.env.UPLOAD_ROOT || "uploads"),
  ),
);

app.get("/", (req, res) => {
  res.json({ message: "UniLife Backend API", status: "OK" });
});

app.use(process.env.API_PREFIX || "/api/v1", routes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
