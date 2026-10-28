"use strict";

/**
 * imageVerificationService.js
 *
 * Stateless helpers for product-image verification guards.
 *
 * These are kept separate from productController so they can be unit-tested
 * without standing up Express, Mongoose, or a blockchain provider.
 */

const crypto = require("crypto");

// ---------------------------------------------------------------
// Category guard
// ---------------------------------------------------------------

/**
 * Regex of category names that the CNN was trained on (medicine packaging only).
 * Any product whose category does not match is CATEGORY_NOT_SUPPORTED.
 *
 * The CNN model was trained exclusively on the Kaggle
 * "Fake vs Real Medicine Dataset" (medicine packaging images).
 * Its output for non-medicine categories is unreliable by design.
 */
const SUPPORTED_CATEGORY_RE = /medicine|pharmaceutical|drug|tablet|capsule|pill/i;

/**
 * Returns true when the product category falls within the CNN's training domain.
 *
 * @param {string|null|undefined} category - Product category string from the database.
 * @returns {boolean}
 */
const isSupportedCategory = (category) =>
    SUPPORTED_CATEGORY_RE.test(String(category ?? ""));

// ---------------------------------------------------------------
// Image hash comparison
// ---------------------------------------------------------------

/**
 * Computes the SHA-256 hex digest of an image buffer.
 *
 * This matches the hash produced by blockchainService.createImageHash()
 * and stored in Product.imageHash at registration time.
 *
 * @param {Buffer} imageBuffer
 * @returns {string} Lowercase hex SHA-256 digest
 */
const hashImageBuffer = (imageBuffer) =>
    crypto.createHash("sha256").update(imageBuffer).digest("hex");

/**
 * Compares an uploaded image buffer against the stored SHA-256 reference hash.
 *
 * IMPORTANT LIMITATION — this is an exact byte-level hash comparison.
 * Re-saving, re-compressing, or resizing the same image will produce a
 * different hash and will be reported as MISMATCH even if the images look
 * identical to the human eye. This is intentional: it acts as a tamper
 * and substitution guard, not a perceptual similarity check.
 *
 * For perceptual similarity (pHash, embedding comparison) a separate
 * implementation is required and has not yet been added.
 *
 * @param {Buffer} uploadedImageBuffer  - Raw bytes of the consumer's uploaded image.
 * @param {string|null|undefined} storedImageHash - Hex SHA-256 stored at registration.
 * @returns {{
 *   status: "MATCH" | "MISMATCH" | "UNAVAILABLE",
 *   method: "SHA256_EXACT",
 *   uploadedHash: string,
 *   storedHash: string | null,
 *   caveat: string
 * }}
 */
const compareImageHash = (uploadedImageBuffer, storedImageHash) => {
    const caveat =
        "SHA-256 exact byte comparison only. A re-compressed or resized copy of the " +
        "same image will be reported as MISMATCH. Perceptual similarity is not implemented.";

    if (!storedImageHash || typeof storedImageHash !== "string" || storedImageHash.trim() === "") {
        return {
            status: "UNAVAILABLE",
            method: "SHA256_EXACT",
            uploadedHash: hashImageBuffer(uploadedImageBuffer),
            storedHash: null,
            caveat
        };
    }

    const uploadedHash = hashImageBuffer(uploadedImageBuffer);
    const status = uploadedHash === storedImageHash.toLowerCase() ? "MATCH" : "MISMATCH";

    return {
        status,
        method: "SHA256_EXACT",
        uploadedHash,
        storedHash: storedImageHash.toLowerCase(),
        caveat
    };
};

module.exports = { isSupportedCategory, compareImageHash, hashImageBuffer, SUPPORTED_CATEGORY_RE };
