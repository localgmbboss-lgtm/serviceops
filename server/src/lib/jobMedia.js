import path from "path";
import fs from "fs";
import multer from "multer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const jobMediaUploadRoot = path.join(__dirname, "..", "uploads", "jobs");
fs.mkdirSync(jobMediaUploadRoot, { recursive: true });

export const JOB_MEDIA_MAX_IMAGES = 3;
export const JOB_MEDIA_MAX_VIDEOS = 1;
export const JOB_MEDIA_MAX_FILES = JOB_MEDIA_MAX_IMAGES + JOB_MEDIA_MAX_VIDEOS;
export const JOB_MEDIA_MAX_SIZE = 25 * 1024 * 1024; // 25 MB

export const JOB_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

const extensionForMime = (mimetype = "") => {
  const [, subtypeRaw] = String(mimetype).toLowerCase().split("/");
  if (!subtypeRaw) return "";
  const subtype = subtypeRaw.split("+")[0];
  if (subtype === "jpeg") return ".jpg";
  if (subtype.includes("heic") || subtype.includes("heif")) return ".heic";
  if (subtype.includes("png")) return ".png";
  if (subtype.includes("gif")) return ".gif";
  if (subtype.includes("webp")) return ".webp";
  if (subtype.includes("mp4")) return ".mp4";
  if (subtype.includes("quicktime")) return ".mov";
  if (subtype.includes("webm")) return ".webm";
  return `.${subtype.replace(/[^a-z0-9]/g, "")}`;
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, jobMediaUploadRoot),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext =
      path.extname(file.originalname)?.toLowerCase() || extensionForMime(file.mimetype);
    cb(null, `${unique}${ext}`);
  },
});

export const jobMediaUpload = multer({
  storage,
  limits: { fileSize: JOB_MEDIA_MAX_SIZE, files: JOB_MEDIA_MAX_FILES },
  fileFilter: (req, file, cb) => {
    if (!JOB_MEDIA_TYPES.has(file.mimetype)) {
      return cb(new Error("Only image and video uploads are allowed"));
    }

    if (!req._jobMediaCounts) {
      req._jobMediaCounts = { images: 0, videos: 0, total: 0 };
    }

    const counts = req._jobMediaCounts;
    const isVideo = file.mimetype.startsWith("video/");
    const isImage = file.mimetype.startsWith("image/");

    if (isVideo) {
      if (counts.videos >= JOB_MEDIA_MAX_VIDEOS) {
        return cb(new Error("You can upload up to 1 video per request."));
      }
      counts.videos += 1;
    } else if (isImage) {
      if (counts.images >= JOB_MEDIA_MAX_IMAGES) {
        return cb(new Error("You can upload up to 3 images per request."));
      }
      counts.images += 1;
    } else {
      return cb(new Error("Only image and video uploads are allowed"));
    }

    counts.total += 1;
    if (counts.total > JOB_MEDIA_MAX_FILES) {
      return cb(
        new Error(
          `A maximum of ${JOB_MEDIA_MAX_IMAGES} images and ${JOB_MEDIA_MAX_VIDEOS} video are allowed.`
        )
      );
    }

    cb(null, true);
  },
});

export const toJobMediaRecord = (file) => {
  const key = file.filename;
  const relativeUrl = path.posix.join("uploads", "jobs", key);
  const kind = file.mimetype?.startsWith("video/")
    ? "video"
    : file.mimetype?.startsWith("image/")
    ? "image"
    : "file";

  return {
    key,
    url: `/${relativeUrl}`,
    fileName: file.originalname || null,
    mimeType: file.mimetype || null,
    size: file.size ?? null,
    kind,
    uploadedAt: new Date(),
  };
};
