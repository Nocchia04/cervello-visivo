import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";

/** Cartella su disco dei file serviti da `/uploads`. */
export const UPLOADS_DIR = path.resolve(__dirname, "../uploads");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/tiff",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Formato file non supportato. Usa JPEG, PNG, WebP o TIFF."));
    }
  },
});
