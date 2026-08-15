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

// Flexible CORS configuration:
//   - Development: allow any localhost/10.0.2.2 (any port) to support
//                  Flutter web (Chrome) and Android Emulator simultaneously
//   - Production:  only allow CLIENT_URL from .env
const corsOrigin =
  process.env.NODE_ENV === "production"
    ? process.env.CLIENT_URL || false
    : (origin, callback) => {
        // Allow requests without origin (Postman, mobile app native)
        if (!origin) return callback(null, true);
        const isAllowed =
          /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(
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
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
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
