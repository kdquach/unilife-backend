const multer = require("multer");
const path = require("path");
const fs = require("fs");

const createStorage = (folder) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(folder, { recursive: true });
      cb(null, folder);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  });

const imageFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("image/"))
    return cb(new Error("Only image files are allowed"));
  cb(null, true);
};

const maxSize = Number(process.env.MAX_FILE_SIZE_MB || 5) * 1024 * 1024;
const avatarUpload = multer({
  storage: createStorage(process.env.AVATAR_UPLOAD_DIR || "uploads/avatars"),
  fileFilter: imageFilter,
  limits: { fileSize: maxSize },
});
const foodUpload = multer({
  storage: createStorage(process.env.FOOD_UPLOAD_DIR || "uploads/foods"),
  fileFilter: imageFilter,
  limits: { fileSize: maxSize },
});

module.exports = { avatarUpload, foodUpload };
