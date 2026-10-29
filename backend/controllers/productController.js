const Verification = require("../models/Verification");
const Product = require("../models/Product");
const ProductRegistration = require("../models/ProductRegistration");
const {
    analyzeScanBehavior
} = require("../services/anomalyService");
const {
    predictImage
} = require("../services/aiService");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const uploadMiddleware = require("../middleware/uploadMiddleware");

const {
    generateProductQR
} = require("../services/qrService");

const {
    deactivateProductOnBlockchain
} = require("../services/blockchainService");
const blockchainService = require("../services/blockchainService");
const blockchainV2Service = require("../services/blockchainV2Service");
const { resolveProductRegistryIdentity } = require("../services/productRegistryIdentity");
const productRegistrationService = require("../services/productRegistrationService");
const { getPartnerDiagnosticLogFields } = require("../services/partnerDiagnostic");
const qrVerificationService = require("../services/qrVerificationService");
const { isSupportedCategory, compareImageHash } = require("../services/imageVerificationService");

const getQrScanLocation = ({ latitude, longitude }) => {
    const hasLatitude = latitude !== undefined && latitude !== null;
    const hasLongitude = longitude !== undefined && longitude !== null;
    if (!hasLatitude && !hasLongitude) return null;
    if (!hasLatitude || !hasLongitude) {
        const error = new Error("Both location coordinates must be provided together");
        error.statusCode = 400;
        throw error;
    }

    if ([latitude, longitude].some((value) =>
        (typeof value !== "number" && typeof value !== "string") ||
        (typeof value === "string" && value.trim() === "")
    )) {
        const error = new Error("Location coordinates are invalid");
        error.statusCode = 400;
        throw error;
    }

    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        const error = new Error("Location coordinates are invalid");
        error.statusCode = 400;
        throw error;
    }
    return { latitude: lat, longitude: lon };
};

const createScanFingerprint = ({ productCode, qrPayload, location, locationConsentStatus, verificationType = "QR" }) => {
    const fingerprint = {
        productCode,
        qrPayload: qrPayload ?? null,
        location: location ?? null,
        locationConsentStatus
    };
    // Preserve the established QR fingerprint format. Include the method for
    // other verification types so one idempotency key cannot cross-replay.
    if (verificationType !== "QR") fingerprint.verificationType = verificationType;
    return crypto.createHash("sha256").update(JSON.stringify(fingerprint)).digest("hex");
};

const createLegacyScanFingerprint = ({ productCode, qrPayload, location }) =>
    crypto.createHash("sha256").update(JSON.stringify({
        productCode,
        qrPayload: qrPayload ?? null,
        location: location ?? null
    })).digest("hex");

const getScanConsentAndLocation = (body = {}) => {
    const hasConsentStatus = Object.hasOwn(body, "locationConsentStatus");
    const consentStatus = hasConsentStatus
        ? String(body.locationConsentStatus).trim().toUpperCase()
        : "UNKNOWN";
    if (!["GRANTED", "DENIED", "NOT_REQUESTED", "UNKNOWN"].includes(consentStatus)) {
        const error = new Error("locationConsentStatus is invalid");
        error.statusCode = 400;
        throw error;
    }

    const suppliedLocation = getQrScanLocation(body);
    if (consentStatus !== "GRANTED" && hasConsentStatus && suppliedLocation) {
        const error = new Error("Coordinates can only be sent when location consent is granted");
        error.statusCode = 400;
        throw error;
    }

    // Legacy clients may send coordinates without a consent field. Keep QR
    // verification compatible, but discard the unconsented coordinates.
    return {
        consentStatus,
        location: consentStatus === "GRANTED" ? suppliedLocation : null,
        legacyFingerprintLocation: hasConsentStatus ? undefined : suppliedLocation
    };
};

const getOrCreateQrScan = async ({ productCode, qrPayload, location, locationConsentStatus, legacyFingerprintLocation, status, requestId, verificationType = "QR" }) => {
    const fingerprint = legacyFingerprintLocation !== undefined
        ? createLegacyScanFingerprint({ productCode, qrPayload, location: legacyFingerprintLocation })
        : createScanFingerprint({ productCode, qrPayload, location, locationConsentStatus, verificationType });
    const key = requestId || crypto.randomUUID();
    if (typeof key !== "string" || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
        const error = new Error("Idempotency-Key is invalid");
        error.statusCode = 400;
        throw error;
    }

    const findExisting = () => Verification.findOne({ scanRequestId: key })
        .select("+scanRequestFingerprint");
    const checkFingerprint = (record) => {
        if (record && record.scanRequestFingerprint !== fingerprint) {
            const error = new Error("Idempotency-Key was already used for a different scan");
            error.statusCode = 409;
            throw error;
        }
        return record;
    };

    const existing = checkFingerprint(await findExisting());
    if (existing) return existing;

    try {
        return await Verification.create({
            productCode,
            verificationType,
            status,
            scoringStatus: verificationType === "QR" && status === "GENUINE"
                ? "INSUFFICIENT_DATA"
                : "NOT_APPLICABLE",
            ...(location ? { location } : {}),
            locationConsentStatus,
            scanRequestId: key,
            scanRequestFingerprint: fingerprint
        });
    } catch (error) {
        if (error.code !== 11000) throw error;
        return checkFingerprint(await findExisting());
    }
};


// ============================================================
// REGISTER PRODUCT
// ============================================================

const prepareProductRegistration = async (req, res) => {
    let uploadedImagePath = req.file?.path;
    try {
        if (!req.file) {
            return res.status(400).json({ message: "Reference image is required before preparing a mint" });
        }

        const referenceImagePath = path.relative(
            path.join(process.cwd(), "uploads"),
            uploadedImagePath
        ).replaceAll("\\", "/");
        const registration = await productRegistrationService.prepareProductRegistration({
            userId: req.user.userId,
            input: req.body,
            distributorId: req.body.distributorId,
            retailerId: req.body.retailerId,
            idempotencyKey: req.get("Idempotency-Key") || req.headers["idempotency-key"],
            referenceImagePath
        });

        if (registration.referenceImagePath !== referenceImagePath) {
            await fs.unlink(uploadedImagePath).catch(() => {});
        }
        uploadedImagePath = null;

        return res.status(200).json({
            message: "Registration was saved. Confirm the mint in MetaMask.",
            registrationId: registration.registrationId,
            status: registration.status,
            productCode: registration.productCode,
            productHash: registration.productHash,
            transaction: registration.transaction
        });
    } catch (error) {
        console.error("Product registration preparation failed:", error.code || "application-error");
        if (uploadedImagePath) await fs.unlink(uploadedImagePath).catch(() => {});
        return res.status(error.statusCode || 503).json({
            message: error.statusCode
                ? error.message
                : "Sepolia or the product database is temporarily unavailable"
        });
    }
};

const confirmProductRegistration = async (req, res) => {
    try {
        const product = await productRegistrationService.confirmProductRegistration({
            userId: req.user.userId,
            registrationId: req.body.registrationId,
            transactionHash: req.body.transactionHash,
            qrCode: generateProductQR
        });

        return res.status(200).json({
            message: "Product registered successfully",
            product: {
                productCode: product.productCode,
                productName: product.productName,
                category: product.category,
                brandName: product.brandName,
                batchNumber: product.batchNumber,
                manufacturingDate: product.manufacturingDate,
                manufacturer: product.manufacturerWallet,
                productHash: product.productHash,
                imageHash: product.imageHash,
                qrCode: product.qrCode
            },
            blockchain: {
                transactionHash: product.transactionHash,
                manufacturerWallet: product.manufacturerWallet,
                productHash: product.productHash,
                imageHash: product.imageHash,
                ipfsImageHash: product.ipfsImageHash
            }
        });
    } catch (error) {
        console.error("Product registration confirmation failed:", error.code || "application-error");
        if (error.code === "PRODUCT_PERSISTENCE_AFTER_MINT") {
            return res.status(503).json({
                message: error.message,
                transactionHash: error.transactionHash,
                retryable: true
            });
        }

        if (error.code === "TRANSACTION_CONFIRMATION_PENDING") {
            return res.status(503).json({
                message: error.message,
                transactionHash: req.body.transactionHash,
                retryable: true
            });
        }

        if (error.code === "REGISTRATION_COMPLETION_PENDING") {
            return res.status(503).json({
                message: error.message,
                transactionHash: req.body.transactionHash,
                retryable: true
            });
        }

        return res.status(error.statusCode || 503).json({
            message: error.statusCode
                ? error.message
                : "Registration could not be confirmed; check the transaction status and retry"
        });
    }
};

const getPendingProductRegistrations = async (req, res) => {
    try {
        const registrations = await productRegistrationService.listPendingProductRegistrations(
            req.user.userId
        );
        return res.status(200).json({ registrations });
    } catch (error) {
        console.error("Pending product registrations lookup failed:", error.code || "application-error");
        return res.status(500).json({ message: "Pending registrations could not be loaded" });
    }
};

const claimProductRegistrationMint = async (req, res) => {
    try {
        const registration = await productRegistrationService.claimProductRegistrationMint({
            userId: req.user.userId,
            registrationId: req.params.registrationId
        });
        return res.status(200).json({ registration });
    } catch (error) {
        console.error("Product mint claim failed:", error.code || "application-error");
        return res.status(error.statusCode || 503).json({
            message: error.statusCode ? error.message : "Registration could not be claimed for mint submission"
        });
    }
};


// ============================================================
// VERIFY PRODUCT BY QR
// ============================================================

const verifyProductByQR = async (req, res) => {
    const { productCode } = req.params;
    const { qrPayload } = req.body || {};

    try {
        const { consentStatus, location, legacyFingerprintLocation } = getScanConsentAndLocation(req.body || {});
        const result = await qrVerificationService.verifyQrProduct({ productCode, qrPayload });
        const requestId = req.get?.("Idempotency-Key") || req.headers?.["idempotency-key"];
        if (!result.verified) {
            await getOrCreateQrScan({
                productCode,
                status: result.status,
                location,
                locationConsentStatus: consentStatus,
                legacyFingerprintLocation,
                qrPayload,
                requestId
            });
            return res.status(200).json(result);
        }

        const product = result.product;
        const verification = await getOrCreateQrScan({
            productCode,
            status: "GENUINE",
            location,
            locationConsentStatus: consentStatus,
            legacyFingerprintLocation,
            qrPayload,
            requestId
        });

        let behaviorAnalysis;
        try {
            behaviorAnalysis = await analyzeScanBehavior(productCode);
        } catch {
            behaviorAnalysis = {
                scanCount: null,
                distinctLocations: null,
                avgTimeBetweenScansHr: null,
                anomalyScore: null,
                isSuspicious: null,
                scoringStatus: "UNAVAILABLE"
            };
        }

        const isScoredSuspicious = behaviorAnalysis.scoringStatus === "SCORED" && behaviorAnalysis.isSuspicious === true;
        verification.status = isScoredSuspicious ? "SUSPICIOUS" : "GENUINE";
        verification.scoringStatus = behaviorAnalysis.scoringStatus || "UNAVAILABLE";
        verification.scanCount = behaviorAnalysis.scanCount;
        verification.distinctLocations = behaviorAnalysis.distinctLocations;
        verification.avgTimeBetweenScansHr = behaviorAnalysis.avgTimeBetweenScansHr;
        verification.anomalyScore = behaviorAnalysis.anomalyScore;
        verification.isSuspicious = behaviorAnalysis.isSuspicious;
        await verification.save();

        const totalScans = await Verification.countDocuments({ productCode, verificationType: "QR" });
        return res.status(200).json({
            // QR and blockchain authenticity remain independent of behavior risk.
            verified: true,
            authenticityStatus: "GENUINE",
            status: verification.status,
            message: isScoredSuspicious
                ? "Product is registered, but its scan behaviour is suspicious."
                : "Product is genuine.",
            scanBehavior: {
                scanCount: verification.scanCount,
                distinctLocations: verification.distinctLocations,
                avgTimeBetweenScansHr: verification.avgTimeBetweenScansHr,
                anomalyScore: verification.anomalyScore,
                isSuspicious: verification.isSuspicious,
                scoringStatus: verification.scoringStatus
            },
            product: {
                productCode: product.productCode,
                productName: product.productName,
                category: product.category,
                brandName: product.brandName,
                batchNumber: product.batchNumber,
                manufacturingDate: product.manufacturingDate,
                manufacturer: product.manufacturerId?.companyName || "Unknown",
                totalScans
            },
            blockchain: {
                ...result.blockchain,
                imageHash: product.imageHash
            }
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            verified: false,
            message: error.statusCode ? error.message : "Server error during QR verification"
        });
    }
};

// A typed product code is not treated as a QR payload. It resolves the saved
// product server-side and independently checks its saved hash and registry on
// chain, without pretending that a QR code was scanned.
const verifyProductByCode = async (req, res) => {
    const productCode = String(req.params.productCode || "").trim();
    if (!productCode || productCode.length > 64) {
        return res.status(400).json({
            verified: false,
            verificationMethod: "MANUAL_CODE",
            status: "INVALID_PRODUCT_CODE",
            message: "Enter a valid product code."
        });
    }
    try {
        const { consentStatus, location, legacyFingerprintLocation } = getScanConsentAndLocation(req.body || {});
        const result = await qrVerificationService.verifyProductCode({ productCode });
        const requestId = req.get?.("Idempotency-Key") || req.headers?.["idempotency-key"];
        const verification = await getOrCreateQrScan({
            productCode,
            status: result.verified ? "GENUINE" : result.status,
            location,
            locationConsentStatus: consentStatus,
            legacyFingerprintLocation,
            requestId,
            verificationType: "MANUAL_CODE"
        });

        return res.status(200).json({
            verified: result.verified,
            verificationMethod: "MANUAL_CODE",
            authenticityStatus: result.verified ? "REGISTERED_ACTIVE" : result.status,
            status: result.status,
            message: result.message,
            product: result.product ? {
                productCode: result.product.productCode,
                productName: result.product.productName,
                category: result.product.category,
                brandName: result.product.brandName,
                manufacturer: result.product.manufacturerId?.companyName || "Unknown"
            } : null,
            blockchain: result.blockchain,
            scanBehavior: { scoringStatus: verification.scoringStatus || "NOT_APPLICABLE" }
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            verified: false,
            verificationMethod: "MANUAL_CODE",
            status: error.statusCode ? "INVALID_REQUEST" : "VERIFICATION_UNAVAILABLE",
            message: error.statusCode ? error.message : "Product code verification is temporarily unavailable."
        });
    }
};

const verifyProductImage = async (req, res) => {

    let uploadedFilePath = null;

    try {

        const { productCode } = req.params;

        const { consentStatus, location } = getScanConsentAndLocation(req.body || {});


        // --------------------------------------------------------
        // Image required
        // --------------------------------------------------------

        if (!req.file) {

            return res.status(400).json({

                verified: false,

                message: "Product image is required"
            });
        }


        uploadedFilePath = req.file.path || null;

        const uploadError = uploadMiddleware.validateImageMetadata(req.file);
        if (uploadError) {
            return res.status(400).json({ verified: false, status: "INVALID_IMAGE", message: uploadError });
        }
        const uploadedImageBytes = req.file.buffer || (req.file.path ? await fs.readFile(req.file.path) : null);
        if (!uploadedImageBytes) {
            return res.status(400).json({ verified: false, status: "INVALID_IMAGE", message: "The uploaded image could not be read." });
        }
        if (!uploadMiddleware.hasValidImageSignature(uploadedImageBytes, req.file.mimetype)) {
            return res.status(400).json({
                verified: false,
                status: "INVALID_IMAGE",
                message: "The selected file is not a valid JPG, PNG, or WEBP image."
            });
        }


        const storedProduct = await Product.findOne({ productCode }).lean();
        if (!storedProduct) {
            return res.status(404).json({ verified: false, status: "NOT_REGISTERED", message: "Product has no saved application registration" });
        }
        const registration = storedProduct.transactionHash
            ? await ProductRegistration.findOne({
                productCode,
                transactionHash: storedProduct.transactionHash,
                status: "COMPLETE"
            }).lean()
            : null;
        const registryIdentity = resolveProductRegistryIdentity({
            product: storedProduct,
            registration,
            blockchainV1: blockchainService,
            blockchainV2: blockchainV2Service
        });
        if (registryIdentity.status !== "RESOLVED") {
            return res.status(503).json({
                verified: false,
                status: "REGISTRY_UNRESOLVED",
                message: "The product registry cannot be established from saved records."
            });
        }
        const selectedBlockchain = registryIdentity.version === 2 ? blockchainV2Service : blockchainService;
        if (registryIdentity.chainId !== Number(selectedBlockchain.SEPOLIA_CHAIN_ID)) {
            return res.status(503).json({
                verified: false,
                status: "REGISTRY_UNAVAILABLE",
                message: "The saved product registry is on a different or unsupported chain."
            });
        }
        const blockchainResult = await selectedBlockchain.verifyProductOnBlockchain(productCode, {
            registryAddress: registryIdentity.address
        });
        const chainProduct = blockchainResult.product;


        if (!blockchainResult.exists || !blockchainResult.isActive || blockchainResult.isFlagged) {
            const status = !blockchainResult.exists
                ? "NOT_REGISTERED"
                : blockchainResult.isFlagged
                    ? "FLAGGED"
                    : "DEACTIVATED";
            await Verification.create({
                productCode,
                verificationType: "IMAGE",
                status,
                scoringStatus: "NOT_APPLICABLE",
                locationConsentStatus: consentStatus,
                ...(location ? { location } : {})
            });
            return res.status(200).json({
                verified: false,
                status,
                authenticityStatus: status,
                imageAnalysis: { status: "NOT_RUN", prediction: null, confidence: null },
                authenticity: { status, blockchainChecked: true, blockchainVerified: false },
                blockchainVerified: false,
                message: "The product is not verified by the selected blockchain registry.",
                product: {
                    productCode: storedProduct.productCode,
                    productName: storedProduct.productName,
                    brandName: storedProduct.brandName
                }
            });
        }

        if (!chainProduct || chainProduct.productId !== productCode || chainProduct.productHash !== storedProduct.productHash) {
            return res.status(409).json({
                verified: false,
                status: "INVALID_QR",
                message: "Saved product identity does not match the selected blockchain registry."
            });
        }


        // --------------------------------------------------------
        // Step 1 — Category guard
        // The CNN was trained on medicine packaging only.
        // Non-medicine categories get CATEGORY_NOT_SUPPORTED regardless of CNN output.
        // --------------------------------------------------------

        const categorySupported = isSupportedCategory(storedProduct.category);

        // --------------------------------------------------------
        // Step 2 — Image hash comparison (exact SHA-256)
        // Compares the uploaded image bytes against the SHA-256 hash
        // stored at product registration time.
        //
        // LIMITATION: This is a byte-exact check. Re-compressed or
        // resized copies of the same image will report MISMATCH.
        // Perceptual image matching is not yet implemented.
        // --------------------------------------------------------

        const imageComparison = compareImageHash(uploadedImageBytes, storedProduct.imageHash);

        // --------------------------------------------------------
        // Step 3 — Run AI image classification
        // CNN output is recorded separately; it never alone determines
        // the top-level verified / status fields.
        // --------------------------------------------------------

        let aiResult;
        let imageAnalysis;

        try {
            aiResult = await predictImage(req.file);
        } catch (aiError) {
            console.warn("AI image analysis unavailable");
            aiResult = null;
        }

        if (aiResult == null) {
            imageAnalysis = { status: "UNAVAILABLE", prediction: null, confidence: null };
        } else {
            const aiPrediction = aiResult?.prediction;
            const aiConfidence = Number(aiResult?.confidence);
            if (
                (aiPrediction !== "genuine" && aiPrediction !== "fake") ||
                !Number.isFinite(aiConfidence) ||
                aiConfidence < 0 ||
                aiConfidence > 1
            ) {
                console.warn("AI image analysis returned an unsupported or invalid response");
                imageAnalysis = { status: "UNAVAILABLE", prediction: null, confidence: null };
            } else {
                imageAnalysis = {
                    status: "SCORED",
                    prediction: aiPrediction,
                    confidence: aiConfidence
                };
            }
        }

        // --------------------------------------------------------
        // Step 4 — Determine overall status and verified flag
        //
        // verified: true ONLY when ALL of the following hold:
        //   * Blockchain: product is registered, active, and hash matches  (checked above)
        //   * Category: falls within the CNN's supported medicine domain   (checked here)
        //   * Image hash: uploaded bytes SHA-256 matches stored reference  (checked here)
        //   * CNN: classified the image as "genuine"                       (checked here)
        //
        // Any failure produces verified: false with the most informative status.
        // --------------------------------------------------------

        let status;
        let verifiedOverall = false;

        if (!categorySupported) {
            // Category not supported by the CNN — cannot trust its output
            status = "CATEGORY_NOT_SUPPORTED";
        } else if (imageComparison.status === "MISMATCH") {
            // Uploaded image does not match the manufacturer's reference image
            status = "IMAGE_MISMATCH";
        } else if (imageAnalysis.status === "UNAVAILABLE") {
            // AI could not be reached or returned an invalid response
            status = "AI_UNAVAILABLE";
        } else if (imageAnalysis.prediction === "fake") {
            status = "FAKE";
        } else if (imageAnalysis.prediction === "genuine") {
            if (imageComparison.status === "MATCH") {
                // All checks pass
                status = "GENUINE";
                verifiedOverall = true;
            } else {
                // imageComparison.status === "UNAVAILABLE": no reference hash stored.
                // CNN says genuine but we cannot confirm the image matches the registered product.
                // Treat conservatively as unverified.
                status = "IMAGE_COMPARISON_UNAVAILABLE";
            }
        } else {
            status = "AI_UNAVAILABLE";
        }

        // --------------------------------------------------------
        // Save verification history
        // --------------------------------------------------------

        await Verification.create({
            productCode,
            verificationType: "IMAGE",
            status,
            ...(imageAnalysis.status === "SCORED" ? { aiConfidence: imageAnalysis.confidence } : {}),
            locationConsentStatus: consentStatus,
            ...(location ? { location } : {})
        });

        // --------------------------------------------------------
        // Response — all four checks are always returned as
        // separate top-level fields so the client can display them
        // independently.
        // --------------------------------------------------------

        return res.status(200).json({

            verified: verifiedOverall,

            status,

            authenticityStatus: "REGISTERED_ACTIVE",

            // CNN classification result (separate from authenticity)
            imageAnalysis,

            // Image hash comparison result (separate from CNN)
            imageComparison,

            authenticity: {
                status: "REGISTERED_ACTIVE",
                blockchainChecked: true,
                blockchainVerified: true,
                productHashMatched: true
            },

            blockchainVerified: true,

            product: {
                productCode: storedProduct.productCode,
                productName: storedProduct.productName,
                category: storedProduct.category,
                brandName: storedProduct.brandName,
                batchNumber: storedProduct.batchNumber,
                manufacturingDate: storedProduct.manufacturingDate
            },

            blockchain: {
                productHash: chainProduct.productHash,
                imageHash: storedProduct.imageHash,
                qrHash: storedProduct.qrHash || null
            }
        });


    } catch (error) {

        console.error(
            "Product image verification error:",
            error
        );


        return res.status(500).json({

            verified: false,

            message:
                "Server error during image verification"
        });


    } finally {

        // --------------------------------------------------------
        // Delete customer's uploaded verification image
        // --------------------------------------------------------

        if (uploadedFilePath) {

            try {

                await fs.unlink(
                    uploadedFilePath
                );

                console.log(
                    "Verification image deleted"
                );

            } catch (deleteError) {

                console.error(
                    "Could not delete verification image:",
                    deleteError.message
                );
            }
        }
    }
};


// ============================================================
// GET MY PRODUCTS
// ============================================================

const getMyProducts = async (req, res) => {
    try {
        const products = await productRegistrationService.listManufacturerProducts(
            req.user.userId
        );
        return res.status(200).json({
            count: products.length,
            products
        });
    } catch (error) {
        console.error("Get my products error:", error.message);
        return res.status(500).json({
            message: "Server error while fetching products"
        });
    }
};

const getApprovedPartners = async (req, res) => {
    const requestedType = String(req.query.type || "").toUpperCase();
    const partnerType = ["DISTRIBUTOR", "RETAILER"].includes(requestedType)
        ? requestedType
        : "OTHER";
    const emptyStageCounts = {
        mongoMatched: 0,
        activeUsers: 0,
        walletsPresent: 0,
        walletsVerified: 0,
        roleReads: 0,
        roleMatches: 0,
        returned: 0
    };
    const safeStageCounts = (counts = {}) => Object.fromEntries(
        Object.keys(emptyStageCounts).map((key) => [
            key,
            Number.isSafeInteger(counts[key]) && counts[key] >= 0 ? counts[key] : 0
        ])
    );
    const logPartnerDiagnostic = (record) => {
        const rpcStatus = ["SUCCESS", "FAILURE", "NOT_CHECKED"].includes(record.rpcStatus)
            ? record.rpcStatus
            : "NOT_CHECKED";
        console.info("Partner lookup diagnostics:", JSON.stringify({
            partnerType,
            rpcStatus,
            stageCounts: safeStageCounts(record.stageCounts)
        }));
    };

    try {
        const partners = await productRegistrationService.getApprovedPartners(
            requestedType,
            {},
            (record) => {
                if (!record.error) logPartnerDiagnostic(record);
            }
        );
        return res.status(200).json({ partners });
    } catch (error) {
        console.error(
            "Get authorized partners failed:",
            JSON.stringify({
                partnerType,
                rpcStatus: ["SUCCESS", "FAILURE", "NOT_CHECKED"].includes(error.partnerLookupDiagnostics?.rpcStatus)
                    ? error.partnerLookupDiagnostics.rpcStatus
                    : "NOT_CHECKED",
                stageCounts: safeStageCounts(error.partnerLookupDiagnostics?.stageCounts),
                error: getPartnerDiagnosticLogFields(error)
            })
        );
        return res.status(error.statusCode || 503).json({
            message: error.statusCode
                ? error.message
                : "ProductRegistry V2 partner authorization is unavailable or not configured"
        });
    }
};


// ============================================================
// DEACTIVATE PRODUCT
// ============================================================

const deleteProduct = async (req, res) => {

    try {

        const { productCode } =
            req.params;


        // --------------------------------------------------------
        // Deactivate on blockchain
        // --------------------------------------------------------

        const result =
            await deactivateProductOnBlockchain(
                productCode
            );


        return res.status(200).json({

            message:
                "Product deactivated successfully",

            productCode,

            transactionHash:
                result.transactionHash
        });


    } catch (error) {

        console.error(
            "Product deletion error:",
            error
        );


        return res.status(500).json({

            message:
                "Product deletion failed",

            error:
                error.message
        });
    }
};

// ============================================================
// CONSUMER DASHBOARD STATISTICS
// ============================================================

const getConsumerStats = async (req, res) => {
    try {
        const [
            totalScans,
            genuineScans,
            suspiciousScans,
            fakeScans
        ] = await Promise.all([
            Verification.countDocuments(),

            Verification.countDocuments({
                status: "GENUINE"
            }),

            Verification.countDocuments({
                status: "SUSPICIOUS"
            }),

            Verification.countDocuments({
                status: "FAKE"
            })
        ]);

        return res.status(200).json({
            success: true,
            stats: {
                totalScans,
                genuineScans,
                suspiciousScans,
                fakeScans
            }
        });

    } catch (error) {
        console.error(
            "Consumer dashboard stats error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Server error while fetching consumer statistics"
        });
    }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    prepareProductRegistration,

    confirmProductRegistration,

    getPendingProductRegistrations,

    claimProductRegistrationMint,

    verifyProductByQR,

    verifyProductByCode,

    verifyProductImage,

    getMyProducts,

    getApprovedPartners,

    deleteProduct,
    getConsumerStats
};
