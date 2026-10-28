const multer = require("multer");
const path = require("path");

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_TYPES = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/jpg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"]
};

const validateImageMetadata = (file) => {
    if (!file || !Object.hasOwn(IMAGE_TYPES, String(file.mimetype || "").toLowerCase())) {
        return "Choose a JPG, JPEG, PNG, or WEBP image.";
    }
    if (Number.isFinite(file.size) && file.size > MAX_IMAGE_SIZE) {
        return "Image must be 5 MB or smaller.";
    }
    const extension = path.extname(file.originalname || "").toLowerCase();
    if (extension && !IMAGE_TYPES[String(file.mimetype).toLowerCase()].includes(extension)) {
        return "Image file extension does not match its image type.";
    }
    return null;
};

const hasValidImageSignature = (buffer, mimetype) => {
    if (!Buffer.isBuffer(buffer)) return false;
    const type = String(mimetype || "").toLowerCase();
    if (type === "image/jpeg" || type === "image/jpg") {
        return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (type === "image/png") {
        return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (type === "image/webp") {
        return buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
    }
    return false;
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/products/");
    },

    filename: (req, file, cb) => {
        const uniqueName =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1E9) +
            path.extname(file.originalname);

        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const error = validateImageMetadata(file);
    if (!error) {
        cb(null, true);
    } else {
        cb(new Error(error));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_IMAGE_SIZE
    }
});

// Convert Multer errors into small, predictable API responses for the public
// consumer upload route. Do not leak local paths or stack traces to clients.
upload.singleImage = (fieldName) => (req, res, next) => {
    upload.single(fieldName)(req, res, (error) => {
        if (!error) return next();
        const tooLarge = error.code === "LIMIT_FILE_SIZE";
        return res.status(tooLarge ? 413 : 400).json({
            verified: false,
            status: "INVALID_IMAGE",
            message: tooLarge ? "Image must be 5 MB or smaller." : error.message
        });
    });
};

upload.MAX_IMAGE_SIZE = MAX_IMAGE_SIZE;
upload.validateImageMetadata = validateImageMetadata;
upload.hasValidImageSignature = hasValidImageSignature;

module.exports = upload;
