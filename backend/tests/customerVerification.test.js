const test = require("node:test");
const assert = require("node:assert/strict");

const upload = require("../middleware/uploadMiddleware");
const qrVerificationService = require("../services/qrVerificationService");

const productCode = "FPD-DEMO-1";
const productHash = "a".repeat(64);
const product = {
    productCode,
    productName: "Demo Medicine",
    brandName: "Demo Brand",
    category: "Medicine",
    productHash,
    registryVersion: 1,
    registryAddress: "0x5555555555555555555555555555555555555555",
    chainId: 11155111,
    manufacturerId: { companyName: "Demo Manufacturer" }
};

const runCodeLookup = async ({ storedProduct = product, chainResult } = {}) => {
    let chainReads = 0;
    let stateChangingCalls = 0;
    const blockchainService = {
        CONTRACT_ADDRESS: product.registryAddress,
        SEPOLIA_CHAIN_ID: 11155111,
        async verifyProductOnBlockchain(code) {
            chainReads += 1;
            assert.equal(code, productCode);
            return chainResult || {
                exists: true,
                isActive: true,
                isFlagged: false,
                product: { productId: productCode, productHash }
            };
        },
        async verifyProduct() { stateChangingCalls += 1; }
    };
    const Product = {
        findOne(query) {
            assert.deepEqual(query, { productCode });
            return { populate: () => ({ lean: async () => storedProduct }) };
        }
    };
    const result = await qrVerificationService.verifyProductCode({ productCode }, { Product, blockchainService });
    return { result, chainReads, stateChangingCalls };
};

test("manual code lookup verifies the saved hash against V1 without claiming a QR was scanned", async () => {
    const { result, chainReads, stateChangingCalls } = await runCodeLookup();
    assert.equal(result.verified, true);
    assert.equal(result.verificationMethod, "MANUAL_CODE");
    assert.equal(result.blockchain.qrMatched, false);
    assert.equal(result.blockchain.manualCodeMatched, true);
    assert.equal(chainReads, 1);
    assert.equal(stateChangingCalls, 0);
});

test("manual code lookup fails closed when saved and on-chain hashes differ", async () => {
    const { result } = await runCodeLookup({
        chainResult: {
            exists: true,
            isActive: true,
            isFlagged: false,
            product: { productId: productCode, productHash: "b".repeat(64) }
        }
    });
    assert.equal(result.verified, false);
    assert.equal(result.status, "INVALID_QR");
});

test("image upload validation accepts supported formats and rejects unsupported or oversized files", () => {
    for (const file of [
        { mimetype: "image/jpeg", originalname: "photo.jpg", size: 100 },
        { mimetype: "image/png", originalname: "photo.png", size: 100 },
        { mimetype: "image/webp", originalname: "photo.webp", size: 100 }
    ]) assert.equal(upload.validateImageMetadata(file), null);

    assert.match(upload.validateImageMetadata({ mimetype: "image/heic", originalname: "photo.heic", size: 100 }), /JPG, JPEG, PNG, or WEBP/);
    assert.match(upload.validateImageMetadata({ mimetype: "image/png", originalname: "photo.jpg", size: 100 }), /extension does not match/);
    assert.match(upload.validateImageMetadata({ mimetype: "image/jpeg", originalname: "photo.jpg", size: upload.MAX_IMAGE_SIZE + 1 }), /5 MB or smaller/);
    assert.equal(upload.limits.fileSize, 5 * 1024 * 1024);
});

test("image content signature must match the declared supported image type", () => {
    assert.equal(upload.hasValidImageSignature(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg"), true);
    assert.equal(upload.hasValidImageSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"), true);
    assert.equal(upload.hasValidImageSignature(Buffer.from("RIFF0000WEBP"), "image/webp"), true);
    assert.equal(upload.hasValidImageSignature(Buffer.from("not an image"), "image/png"), false);
    assert.equal(upload.hasValidImageSignature(Buffer.from("RIFF0000WEBP"), "image/jpeg"), false);
});

test("Multer upload errors return an explicit 400 or 413 response", async () => {
    const originalSingle = upload.single;
    try {
        for (const [error, expectedStatus] of [
            [Object.assign(new Error("too large"), { code: "LIMIT_FILE_SIZE" }), 413],
            [new Error("Choose a JPG, JPEG, PNG, or WEBP image."), 400]
        ]) {
            upload.single = () => (_req, _res, callback) => callback(error);
            let body;
            const res = {
                status(statusCode) { this.statusCode = statusCode; return this; },
                json(value) { body = value; return this; }
            };
            await upload.singleImage("productImage")({}, res, () => assert.fail("next must not run on upload errors"));
            assert.equal(res.statusCode, expectedStatus);
            assert.equal(body.status, "INVALID_IMAGE");
        }
    } finally {
        upload.single = originalSingle;
    }
});

test("image controller reports AI UNAVAILABLE while preserving a successful registry check", async () => {
    const aiService = require("../services/aiService");
    const productRegistryIdentity = require("../services/productRegistryIdentity");
    const Product = require("../models/Product");
    const Verification = require("../models/Verification");
    const blockchainService = require("../services/blockchainService");
    const controllerPath = require.resolve("../controllers/productController");
    const originals = {
        predictImage: aiService.predictImage,
        resolveIdentity: productRegistryIdentity.resolveProductRegistryIdentity,
        findProduct: Product.findOne,
        createVerification: Verification.create,
        verifyOnChain: blockchainService.verifyProductOnBlockchain
    };

    let savedVerification;
    try {
        aiService.predictImage = async () => { throw Object.assign(new Error("disabled"), { code: "AI_DISABLED" }); };
        productRegistryIdentity.resolveProductRegistryIdentity = () => ({
            status: "RESOLVED", version: 1, chainId: 11155111, address: product.registryAddress
        });
        Product.findOne = () => ({ lean: async () => product });
        Verification.create = async (record) => { savedVerification = record; return record; };
        blockchainService.verifyProductOnBlockchain = async () => ({
            exists: true,
            isActive: true,
            isFlagged: false,
            product: { productId: productCode, productHash }
        });
        delete require.cache[controllerPath];
        const controller = require(controllerPath);
        let responseBody;
        const res = {
            status(statusCode) { this.statusCode = statusCode; return this; },
            json(body) { responseBody = body; return this; }
        };
        await controller.verifyProductImage({
            params: { productCode },
            body: { locationConsentStatus: "NOT_REQUESTED" },
            file: {
                buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
                mimetype: "image/png",
                originalname: "customer.png",
                size: 8
            }
        }, res);

        assert.equal(res.statusCode, 200);
        assert.equal(responseBody.authenticity.blockchainVerified, true);
        assert.equal(responseBody.authenticityStatus, "REGISTERED_ACTIVE");
        assert.deepEqual(responseBody.imageAnalysis, { status: "UNAVAILABLE", prediction: null, confidence: null });
        assert.equal(responseBody.verified, false);
        assert.equal(savedVerification.status, "AI_UNAVAILABLE");
        assert.equal(savedVerification.aiConfidence, undefined);
    } finally {
        aiService.predictImage = originals.predictImage;
        productRegistryIdentity.resolveProductRegistryIdentity = originals.resolveIdentity;
        Product.findOne = originals.findProduct;
        Verification.create = originals.createVerification;
        blockchainService.verifyProductOnBlockchain = originals.verifyOnChain;
        delete require.cache[controllerPath];
    }
});


// ============================================================
// imageVerificationService — unit tests
// ============================================================

const { isSupportedCategory, compareImageHash } = require("../services/imageVerificationService");
const crypto = require("node:crypto");

// ---------------------------------------------------------------
// isSupportedCategory
// ---------------------------------------------------------------

test("isSupportedCategory returns true for medicine-type categories", () => {
    for (const cat of ["Medicine", "medicine", "MEDICINE", "Pharmaceutical", "Drug", "Tablet", "Capsule", "Pill", "tablet capsule"]) {
        assert.equal(isSupportedCategory(cat), true, `expected true for: ${cat}`);
    }
});

test("isSupportedCategory returns false for non-medicine categories", () => {
    for (const cat of ["Watch", "Electronics", "Food", "Clothing", "Cosmetics", "Beverage", "Supplement", ""]) {
        assert.equal(isSupportedCategory(cat), false, `expected false for: ${cat}`);
    }
});

test("isSupportedCategory handles null and undefined safely", () => {
    assert.equal(isSupportedCategory(null), false);
    assert.equal(isSupportedCategory(undefined), false);
});

// ---------------------------------------------------------------
// compareImageHash — MATCH
// ---------------------------------------------------------------

test("compareImageHash returns MATCH when uploaded bytes match stored SHA-256", () => {
    const buf = Buffer.from("reference image bytes");
    const storedHash = crypto.createHash("sha256").update(buf).digest("hex");
    const result = compareImageHash(buf, storedHash);
    assert.equal(result.status, "MATCH");
    assert.equal(result.method, "SHA256_EXACT");
    assert.equal(result.uploadedHash, storedHash);
    assert.equal(result.storedHash, storedHash);
    assert.ok(result.caveat, "caveat must be present");
});

// ---------------------------------------------------------------
// compareImageHash — MISMATCH
// ---------------------------------------------------------------

test("compareImageHash returns MISMATCH when uploaded bytes differ from stored hash", () => {
    const referenceBytes = Buffer.from("original reference image");
    const uploadedBytes  = Buffer.from("a completely different watch image");
    const storedHash     = crypto.createHash("sha256").update(referenceBytes).digest("hex");
    const result = compareImageHash(uploadedBytes, storedHash);
    assert.equal(result.status, "MISMATCH");
    assert.notEqual(result.uploadedHash, result.storedHash);
});

// ---------------------------------------------------------------
// compareImageHash — UNAVAILABLE (no stored hash)
// ---------------------------------------------------------------

test("compareImageHash returns UNAVAILABLE when stored hash is null", () => {
    const result = compareImageHash(Buffer.from("any image"), null);
    assert.equal(result.status, "UNAVAILABLE");
    assert.equal(result.storedHash, null);
    assert.ok(result.uploadedHash, "uploadedHash must still be computed");
});

test("compareImageHash returns UNAVAILABLE when stored hash is empty string", () => {
    const result = compareImageHash(Buffer.from("any image"), "");
    assert.equal(result.status, "UNAVAILABLE");
});

test("compareImageHash returns UNAVAILABLE when stored hash is undefined", () => {
    const result = compareImageHash(Buffer.from("any image"), undefined);
    assert.equal(result.status, "UNAVAILABLE");
});

// ---------------------------------------------------------------
// Full pipeline — verifyProductImage controller integration
// Tests use the same harness pattern as the existing AI_UNAVAILABLE test.
// ---------------------------------------------------------------

/**
 * Returns a Buffer that passes hasValidImageSignature for "image/png".
 * The suffix differentiates images so they produce distinct SHA-256 hashes.
 *
 * @param {string|Buffer} suffix  Arbitrary tail bytes appended after the PNG header.
 * @returns {Buffer}
 */
const makePngBuffer = (suffix = "") =>
    Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.isBuffer(suffix) ? suffix : Buffer.from(String(suffix))
    ]);

/**
 * Shared helper that stubs all external dependencies and invokes
 * verifyProductImage.  The caller controls which aspects to override.
 */
const runImageVerification = async ({
    storedProduct: storedProductOverride,
    aiResponse,
    aiThrows = false,
    uploadedBytes = makePngBuffer("default-upload"),
    extraProductProps = {}
} = {}) => {
    const aiService            = require("../services/aiService");
    const productRegistryId    = require("../services/productRegistryIdentity");
    const Product              = require("../models/Product");
    const Verification         = require("../models/Verification");
    const blockchainServiceMod = require("../services/blockchainService");
    const controllerPath       = require.resolve("../controllers/productController");

    const pCode = "IMG-TEST-1";
    const pHash = "c".repeat(64);
    const regAddress = "0x9999999999999999999999999999999999999999";

    const defaultProduct = {
        productCode: pCode,
        productName: "Test Medicine",
        brandName:   "Test Brand",
        category:    "Medicine",
        productHash: pHash,
        imageHash:   null,   // default: no stored hash (UNAVAILABLE path)
        registryVersion:  1,
        registryAddress:  regAddress,
        chainId:          11155111,
        manufacturerId:   { companyName: "Test Manufacturer" },
        ...extraProductProps
    };

    const storedProduct = storedProductOverride ?? defaultProduct;

    const originals = {
        predictImage: aiService.predictImage,
        resolveIdentity: productRegistryId.resolveProductRegistryIdentity,
        findProduct: Product.findOne,
        createVerification: Verification.create,
        verifyOnChain: blockchainServiceMod.verifyProductOnBlockchain
    };

    let savedVerification;

    try {
        if (aiThrows) {
            aiService.predictImage = async () => { throw Object.assign(new Error("ai down"), { code: "AI_DISABLED" }); };
        } else if (aiResponse !== undefined) {
            aiService.predictImage = async () => aiResponse;
        } else {
            aiService.predictImage = async () => ({ prediction: "genuine", confidence: 0.97 });
        }

        productRegistryId.resolveProductRegistryIdentity = () => ({
            status: "RESOLVED", version: 1, chainId: 11155111, address: regAddress
        });
        Product.findOne = () => ({ lean: async () => storedProduct });
        Verification.create = async (record) => { savedVerification = record; return record; };
        blockchainServiceMod.verifyProductOnBlockchain = async () => ({
            exists: true, isActive: true, isFlagged: false,
            product: { productId: pCode, productHash: pHash }
        });

        delete require.cache[controllerPath];
        const controller = require(controllerPath);

        let responseBody;
        const res = {
            status(code) { this.statusCode = code; return this; },
            json(body)   { responseBody = body; return this; }
        };

        await controller.verifyProductImage({
            params: { productCode: pCode },
            body:   { locationConsentStatus: "NOT_REQUESTED" },
            file:   {
                buffer:       uploadedBytes,
                mimetype:     "image/png",
                originalname: "test.png",
                size:         uploadedBytes.length
            }
        }, res);

        return { responseBody, savedVerification, statusCode: res.statusCode };
    } finally {
        aiService.predictImage                              = originals.predictImage;
        productRegistryId.resolveProductRegistryIdentity   = originals.resolveIdentity;
        Product.findOne                                     = originals.findProduct;
        Verification.create                                 = originals.createVerification;
        blockchainServiceMod.verifyProductOnBlockchain      = originals.verifyOnChain;
        delete require.cache[controllerPath];
    }
};

// ---- Watch image vs tablet product ----

test("watch image against a non-medicine product returns CATEGORY_NOT_SUPPORTED, verified false", async () => {
    const { responseBody, savedVerification } = await runImageVerification({
        extraProductProps: { category: "Watch" },
        // CNN would say "genuine" at 99% — should be ignored
        aiResponse: { prediction: "genuine", confidence: 0.99 }
    });
    assert.equal(responseBody.verified, false);
    assert.equal(responseBody.status, "CATEGORY_NOT_SUPPORTED");
    assert.equal(savedVerification.status, "CATEGORY_NOT_SUPPORTED");
    // imageAnalysis is still present and separate
    assert.ok(responseBody.imageAnalysis, "imageAnalysis field must be present");
    // imageComparison is present and separate
    assert.ok(responseBody.imageComparison, "imageComparison field must be present");
    // authenticity (blockchain) is independent and still reported
    assert.equal(responseBody.authenticity.blockchainVerified, true);
});

// ---- Unsupported categories ----

test("electronics, food, clothing, cosmetics categories all return CATEGORY_NOT_SUPPORTED", async () => {
    for (const category of ["Electronics", "Food", "Clothing", "Cosmetics", "Beverage", "Watch"]) {
        const { responseBody } = await runImageVerification({
            extraProductProps: { category },
            aiResponse: { prediction: "genuine", confidence: 0.95 }
        });
        assert.equal(responseBody.verified, false, `category: ${category}`);
        assert.equal(responseBody.status, "CATEGORY_NOT_SUPPORTED", `category: ${category}`);
    }
});

// ---- Image hash MISMATCH overrides CNN "genuine" ----

test("image hash MISMATCH returns IMAGE_MISMATCH even when CNN says genuine", async () => {
    const referenceBytes = makePngBuffer("the real product image");
    const storedHash     = crypto.createHash("sha256").update(referenceBytes).digest("hex");
    const uploadedBytes  = makePngBuffer("a different watch image");

    const { responseBody, savedVerification } = await runImageVerification({
        extraProductProps: { category: "Medicine", imageHash: storedHash },
        uploadedBytes,
        aiResponse: { prediction: "genuine", confidence: 0.99 }
    });

    assert.equal(responseBody.verified, false);
    assert.equal(responseBody.status, "IMAGE_MISMATCH");
    assert.equal(responseBody.imageComparison.status, "MISMATCH");
    assert.equal(savedVerification.status, "IMAGE_MISMATCH");
    // CNN still ran and is reported separately
    assert.equal(responseBody.imageAnalysis.status, "SCORED");
    assert.equal(responseBody.imageAnalysis.prediction, "genuine");
});

// ---- Missing imageHash (UNAVAILABLE) — CNN genuine cannot promote to GENUINE ----

test("missing imageHash with CNN genuine produces IMAGE_COMPARISON_UNAVAILABLE, not GENUINE", async () => {
    const { responseBody, savedVerification } = await runImageVerification({
        extraProductProps: { category: "Medicine", imageHash: null },
        aiResponse: { prediction: "genuine", confidence: 0.90 }
    });

    assert.equal(responseBody.verified, false);
    assert.equal(responseBody.status, "IMAGE_COMPARISON_UNAVAILABLE");
    assert.equal(responseBody.imageComparison.status, "UNAVAILABLE");
    assert.equal(savedVerification.status, "IMAGE_COMPARISON_UNAVAILABLE");
    assert.equal(responseBody.authenticity.blockchainVerified, true);
});

// ---- Full happy path: medicine, hash MATCH, CNN genuine → GENUINE ----

test("medicine product with matching hash and CNN genuine is GENUINE and verified true", async () => {
    const imageBytes = makePngBuffer("exact reference image bytes");
    const storedHash = crypto.createHash("sha256").update(imageBytes).digest("hex");

    const { responseBody, savedVerification } = await runImageVerification({
        extraProductProps: { category: "Medicine", imageHash: storedHash },
        uploadedBytes: imageBytes,
        aiResponse: { prediction: "genuine", confidence: 0.92 }
    });

    assert.equal(responseBody.verified, true);
    assert.equal(responseBody.status, "GENUINE");
    assert.equal(responseBody.imageComparison.status, "MATCH");
    assert.equal(responseBody.imageAnalysis.prediction, "genuine");
    assert.equal(savedVerification.status, "GENUINE");
    assert.ok(typeof savedVerification.aiConfidence === "number");
});

// ---- CNN says fake, hash MATCH: status is FAKE ----

test("medicine product with matching hash but CNN fake is FAKE and verified false", async () => {
    const imageBytes = makePngBuffer("genuine medicine image bytes");
    const storedHash = crypto.createHash("sha256").update(imageBytes).digest("hex");

    const { responseBody } = await runImageVerification({
        extraProductProps: { category: "Medicine", imageHash: storedHash },
        uploadedBytes: imageBytes,
        aiResponse: { prediction: "fake", confidence: 0.85 }
    });

    assert.equal(responseBody.verified, false);
    assert.equal(responseBody.status, "FAKE");
    assert.equal(responseBody.imageComparison.status, "MATCH");
    assert.equal(responseBody.imageAnalysis.prediction, "fake");
});

// ---- AI unavailable: medicine category, hash available but AI down ----

test("AI_UNAVAILABLE when CNN throws, even with matching hash and medicine category", async () => {
    const imageBytes = makePngBuffer("medicine image for ai down test");
    const storedHash = crypto.createHash("sha256").update(imageBytes).digest("hex");

    const { responseBody, savedVerification } = await runImageVerification({
        extraProductProps: { category: "Medicine", imageHash: storedHash },
        uploadedBytes: imageBytes,
        aiThrows: true
    });

    assert.equal(responseBody.verified, false);
    assert.equal(responseBody.status, "AI_UNAVAILABLE");
    assert.equal(responseBody.imageAnalysis.status, "UNAVAILABLE");
    assert.equal(savedVerification.status, "AI_UNAVAILABLE");
    assert.equal(savedVerification.aiConfidence, undefined, "no aiConfidence when AI unavailable");
    // imageComparison is still run and reported
    assert.equal(responseBody.imageComparison.status, "MATCH");
    // blockchain authenticity preserved
    assert.equal(responseBody.authenticity.blockchainVerified, true);
});

// ---- Existing AI_UNAVAILABLE test still passes after restructure ----
// The existing test at the top of this file (line 115) validates that the
// AI UNAVAILABLE path preserves blockchain authenticity. That test still runs
// as part of the suite — this note is a documentation anchor only.
