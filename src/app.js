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

// Cấu hình CORS linh hoạt:
//   - Development: cho phép mọi localhost/10.0.2.2 (bất kỳ port) để hỗ trợ
//                  Flutter web (Chrome) và Android Emulator đồng thời
//   - Production:  chỉ cho phép CLIENT_URL trong .env
const corsOrigin =
  process.env.NODE_ENV === "production"
    ? process.env.CLIENT_URL || false
    : (origin, callback) => {
        // Cho phép requests không có origin (Postman, mobile app native)
        if (!origin) return callback(null, true);
        const isAllowed =
          /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/.test(
            origin,
          );
        callback(
          isAllowed ? null : new Error(`CORS blocked: ${origin}`),
          isAllowed,
        );
      };

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ 
  limit: "10mb",
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
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
