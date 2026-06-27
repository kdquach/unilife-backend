const { Server } = require("socket.io");
const { verifyAccessToken } = require("./utils/jwt.util");

let io = null;

const getCorsOrigin = () => {
  if (process.env.NODE_ENV === "production") {
    return process.env.CLIENT_URL || false;
  }

  return (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed =
      /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/.test(origin);
    callback(isAllowed ? null : new Error(`Socket CORS blocked: ${origin}`), isAllowed);
  };
};

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: getCorsOrigin(),
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        "";
      if (!token) return next(new Error("Access token is required"));

      const decoded = verifyAccessToken(token);
      socket.user = decoded;
      socket.join(`user:${decoded.userId}`);
      return next();
    } catch (error) {
      return next(new Error("Invalid or expired access token"));
    }
  });

  io.on("connection", (socket) => {
    socket.emit("socket:connected", {
      userId: socket.user.userId,
      message: "Socket connected",
    });
  });

  return io;
};

const getIO = () => io;

const emitToUser = (userId, event, payload) => {
  if (!io || !userId) return false;
  io.to(`user:${userId.toString()}`).emit(event, payload);
  return true;
};

module.exports = { initSocket, getIO, emitToUser };
