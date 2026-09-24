const Manufacturer = require("../models/Manufacturer");
const Verification = require("../models/Verification");

const path = require("path");
const fs = require("fs/promises");

const {
    generateProductQR
} = require("../services/qrService");

const {
    createQRHash,
    registerProductOnBlockchain,
    getProductFromBlockchain,
    verifyProductOnBlockchain,
    getManufacturerProducts,
    deactivateProductOnBlockchain
} = require("../services/blockchainService");


// ============================================================
// REGISTER PRODUCT
// ============================================================

const registerProduct = async (req, res) => {
    try {

        const {
            productName,
            category,
            brandName,
            batchNumber,
            manufacturingDate
        } = req.body;


        // --------------------------------------------------------
        // Validate product fields
        // --------------------------------------------------------

        if (
            !productName ||
            !category ||
            !brandName ||
            !batchNumber ||
            !manufacturingDate
        ) {
            return res.status(400).json({
                message: "All product fields are required"
            });
        }


        // --------------------------------------------------------
        // Reference image required
        // --------------------------------------------------------

        if (!req.file) {
            return res.status(400).json({
                message: "Genuine product reference image is required"
            });
        }


        // --------------------------------------------------------
        // Find logged-in manufacturer
        // --------------------------------------------------------

        const manufacturer = await Manufacturer.findOne({
            userId: req.user.userId
        });

        if (!manufacturer) {
            return res.status(404).json({
                message: "Manufacturer profile not found"
            });
        }


        // --------------------------------------------------------
        // Manufacturer must be verified
        // --------------------------------------------------------

        if (manufacturer.verificationStatus !== "VERIFIED") {
            return res.status(403).json({
                message: "Manufacturer approval required"
            });
        }


        // --------------------------------------------------------
        // Generate product code
        //
        // We no longer use MongoDB to generate the code.
        // --------------------------------------------------------

        const manufacturerAddress =
            process.env.MANUFACTURER_PRIVATE_KEY
                ? new (require("ethers").Wallet)(
                    process.env.MANUFACTURER_PRIVATE_KEY
                ).address
                : null;

        if (!manufacturerAddress) {
            return res.status(500).json({
                message: "Manufacturer blockchain wallet is not configured"
            });
        }


        // Get existing products from blockchain
        const existingProductCodes =
            await getManufacturerProducts(manufacturerAddress);


        let nextNumber = 1;

        for (const code of existingProductCodes) {

            const match = String(code).match(/^FPD(\d+)$/);

            if (match) {

                const number = parseInt(match[1], 10);

                if (!isNaN(number) && number >= nextNumber) {
                    nextNumber = number + 1;
                }
            }
        }


        const productCode =
            `FPD${String(nextNumber).padStart(4, "0")}`;


        // --------------------------------------------------------
        // Read reference image
        // --------------------------------------------------------

        const imagePath = path.join(
            process.cwd(),
            "uploads",
            "products",
            req.file.filename
        );

        const imageBuffer = await fs.readFile(imagePath);


        // --------------------------------------------------------
        // QR data
        //
        // The QR represents the product code.
        // --------------------------------------------------------

        const qrData = productCode;

        const qrHash = createQRHash(qrData);


        // --------------------------------------------------------
        // Register EVERYTHING on blockchain
        // --------------------------------------------------------

        const blockchainResult =
            await registerProductOnBlockchain({

                productCode,

                productName,

                category,

                brandName,

                batchNumber,

                manufacturingDate,

                manufacturer: manufacturerAddress,

                imageBuffer,

                qrData
            });


        // --------------------------------------------------------
        // Generate QR image
        // --------------------------------------------------------

        const qrCode =
            await generateProductQR(productCode);


        // --------------------------------------------------------
        // Return result
        // --------------------------------------------------------

        return res.status(201).json({

            message: "Product registered successfully",

            product: {

                productCode,

                productName,

                category,

                brandName,

                batchNumber,

                manufacturingDate,

                manufacturer: manufacturerAddress,

                qrCode,

                productHash:
                    blockchainResult.productHash,

                imageHash:
                    blockchainResult.imageHash,

                qrHash:
                    blockchainResult.qrHash || qrHash
            },

            blockchain: {

                transactionHash:
                    blockchainResult.transactionHash,

                manufacturerWallet:
                    blockchainResult.manufacturerWallet,

                productHash:
                    blockchainResult.productHash,

                imageHash:
                    blockchainResult.imageHash,

                qrHash:
                    blockchainResult.qrHash || qrHash
            }
        });


    } catch (error) {

        console.error(
            "Product registration error:",
            error
        );

        return res.status(500).json({
            message: "Product registration failed",
            error: error.message
        });
    }
};


// ============================================================
// VERIFY PRODUCT BY QR
// ============================================================

const verifyProductByQR = async (req, res) => {
    try {

        const { productCode } = req.params;

        const {
            latitude,
            longitude
        } = req.body || {};


        // ========================================================
        // LOCATION
        // ========================================================

        if (
            latitude === undefined ||
            longitude === undefined
        ) {
            return res.status(400).json({
                verified: false,
                message: "Location is required"
            });
        }


       // ========================================================
// CHECK BLOCKCHAIN RECORD FIRST
// ========================================================

const blockchainResult =
    await verifyProductOnBlockchain(productCode);


// ========================================================
// PRODUCT DOES NOT EXIST
// ========================================================

if (!blockchainResult.exists) {

    await Verification.create({
        productCode,
        verificationType: "QR",
        status: "NOT_REGISTERED",
        location: {
            latitude,
            longitude
        }
    });

    return res.status(200).json({

        verified: false,

        status: "NOT_REGISTERED",

        message:
            "Product is not registered on the blockchain",

        blockchain: {
            checked: true,
            exists: false,
            active: false,
            flagged: false,
            qrMatched: false
        }
    });
}


// ========================================================
// PRODUCT EXISTS, NOW GET COMPLETE PRODUCT DETAILS
// ========================================================

const product =
    await getProductFromBlockchain(productCode);

        // ========================================================
        // QR HASH VERIFICATION
        // ========================================================

        const expectedQRHash =
            createQRHash(productCode);

        const qrMatches =
            blockchainResult.qrHash === expectedQRHash;


        // ========================================================
        // PRODUCT FLAGGED
        // ========================================================

        if (blockchainResult.isFlagged) {

            await Verification.create({
                productCode,
                verificationType: "QR",
                status: "FLAGGED",
                location: {
                    latitude,
                    longitude
                }
            });

            return res.status(200).json({

                verified: false,

                status: "FLAGGED",

                message:
                    "Product has been flagged on the blockchain",

                product: {
                    productCode:
                        product.productId,

                    productName:
                        product.productName,

                    category:
                        product.category,

                    brandName:
                        product.brandName
                },

                blockchain: {
                    checked: true,
                    exists: true,
                    active: blockchainResult.isActive,
                    flagged: true,
                    qrMatched: qrMatches
                }
            });
        }


        // ========================================================
        // PRODUCT DEACTIVATED
        // ========================================================

        if (!blockchainResult.isActive) {

            await Verification.create({
                productCode,
                verificationType: "QR",
                status: "DEACTIVATED",
                location: {
                    latitude,
                    longitude
                }
            });

            return res.status(200).json({

                verified: false,

                status: "DEACTIVATED",

                message:
                    "Product has been deactivated",

                product: {
                    productCode:
                        product.productId,

                    productName:
                        product.productName,

                    category:
                        product.category,

                    brandName:
                        product.brandName
                },

                blockchain: {
                    checked: true,
                    exists: true,
                    active: false,
                    flagged: false,
                    qrMatched: qrMatches
                }
            });
        }


        // ========================================================
        // QR HASH DOES NOT MATCH
        // ========================================================

        if (!qrMatches) {

            await Verification.create({
                productCode,
                verificationType: "QR",
                status: "INVALID_QR",
                location: {
                    latitude,
                    longitude
                }
            });

            return res.status(200).json({

                verified: false,

                status: "INVALID_QR",

                message:
                    "QR verification failed. Possible counterfeit product.",

                product: {
                    productCode:
                        product.productId,

                    productName:
                        product.productName,

                    category:
                        product.category,

                    brandName:
                        product.brandName
                },

                blockchain: {
                    checked: true,
                    exists: true,
                    active: true,
                    flagged: false,
                    qrMatched: false
                }
            });
        }


        // ========================================================
        // EVERYTHING PASSED
        // ========================================================

        const totalScans =
            await Verification.countDocuments({
                productCode,
                verificationType: "QR"
            });


        await Verification.create({
            productCode,
            verificationType: "QR",
            status: "GENUINE",
            location: {
                latitude,
                longitude
            }
        });


        return res.status(200).json({

            verified: true,

            status: "GENUINE",

            message:
                "Product is genuine",

            product: {

                productCode:
                    product.productId,

                productName:
                    product.productName,

                category:
                    product.category,

                brandName:
                    product.brandName,

                batchNumber:
                    product.batchNumber,

                manufacturingDate:
                    product.manufacturingDate,

                manufacturer:
                    product.manufacturer,

                totalScans:
                    totalScans + 1
            },

            blockchain: {

                checked: true,

                exists:
                    blockchainResult.exists,

                active:
                    blockchainResult.isActive,

                flagged:
                    blockchainResult.isFlagged,

                qrMatched: true,

                productHash:
                    product.productHash,

                imageHash:
                    product.imageHash,

                qrHash:
                    product.qrHash
            }
        });


    } catch (error) {

        console.error(
            "QR verification error:",
            error
        );

        return res.status(500).json({

            verified: false,

            message:
                "Server error during QR verification",

            error:
                error.message
        });
    }
};

// ============================================================
// VERIFY PRODUCT BY IMAGE
// ============================================================

const verifyProductImage = async (req, res) => {

    let uploadedFilePath = null;

    try {

        const { productCode } = req.params;

        const {
            latitude,
            longitude
        } = req.body || {};


        // --------------------------------------------------------
        // Location required
        // --------------------------------------------------------

        if (
            latitude === undefined ||
            longitude === undefined
        ) {

            return res.status(400).json({

                verified: false,

                message: "Location is required"
            });
        }


        // --------------------------------------------------------
        // Image required
        // --------------------------------------------------------

        if (!req.file) {

            return res.status(400).json({

                verified: false,

                message: "Product image is required"
            });
        }


        uploadedFilePath =
            req.file.path;


        // --------------------------------------------------------
        // Get product from blockchain
        // --------------------------------------------------------

        const product =
            await getProductFromBlockchain(productCode);


        if (!product) {

            return res.status(404).json({

                verified: false,

                status: "FAKE",

                message: "Product is not registered"
            });
        }


        // --------------------------------------------------------
        // Verify blockchain record
        // --------------------------------------------------------

        const blockchainResult =
            await verifyProductOnBlockchain(productCode);


        if (
            !blockchainResult.exists ||
            !blockchainResult.isActive ||
            blockchainResult.isFlagged
        ) {

            await Verification.create({

                productCode,

                verificationType: "IMAGE",

                status: "FAKE",

                location: {

                    latitude,

                    longitude
                }
            });


            return res.status(200).json({

                verified: false,

                status: "FAKE",

                message:
                    "Blockchain verification failed",

                product: {

                    productCode:
                        product.productId,

                    productName:
                        product.productName,

                    brandName:
                        product.brandName
                }
            });
        }


        // --------------------------------------------------------
        // Read consumer image
        // --------------------------------------------------------

        const imageBuffer =
            await fs.readFile(
                uploadedFilePath
            );


        // --------------------------------------------------------
        // Send image to Python AI service
        // --------------------------------------------------------

        const formData =
            new FormData();


        const imageBlob =
            new Blob(
                [imageBuffer],
                {
                    type:
                        req.file.mimetype ||
                        "application/octet-stream"
                }
            );


        formData.append(
            "file",
            imageBlob,
            req.file.originalname ||
            "product-image.jpg"
        );


        const aiResponse =
            await fetch(
                `${process.env.AI_SERVICE_URL}/predict`,
                {
                    method: "POST",
                    body: formData
                }
            );


        // --------------------------------------------------------
        // AI service unavailable
        // --------------------------------------------------------

        if (!aiResponse.ok) {

            const aiError =
                await aiResponse.text();

            console.error(
                "AI service error:",
                aiError
            );


            return res.status(503).json({

                verified: false,

                message:
                    "AI verification service unavailable"
            });
        }


        const aiResult =
            await aiResponse.json();


        const aiPrediction =
            aiResult.prediction;


        const aiConfidence =
            Number(aiResult.confidence);


        // --------------------------------------------------------
        // Convert AI result
        // --------------------------------------------------------

        let status;


        if (
            aiPrediction === "fake"
        ) {

            status = "FAKE";

        } else if (
            aiPrediction === "genuine"
        ) {

            status = "GENUINE";

        } else {

            status = "SUSPICIOUS";
        }


        // --------------------------------------------------------
        // Save verification history
        // --------------------------------------------------------

        await Verification.create({

            productCode,

            verificationType: "IMAGE",

            status,

            aiConfidence,

            location: {

                latitude,

                longitude
            }
        });


        // --------------------------------------------------------
        // Response
        // --------------------------------------------------------

        return res.status(200).json({

            verified:
                status === "GENUINE",

            status,

            aiPrediction,

            aiConfidence,

            blockchainVerified: true,

            product: {

                productCode:
                    product.productId,

                productName:
                    product.productName,

                category:
                    product.category,

                brandName:
                    product.brandName,

                batchNumber:
                    product.batchNumber,

                manufacturingDate:
                    product.manufacturingDate
            },

            blockchain: {

                productHash:
                    product.productHash,

                imageHash:
                    product.imageHash,

                qrHash:
                    product.qrHash
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

        const manufacturer =
            await Manufacturer.findOne({
                userId: req.user.userId
            });


        if (!manufacturer) {

            return res.status(404).json({

                message:
                    "Manufacturer profile not found"
            });
        }


        // --------------------------------------------------------
        // Get blockchain wallet
        // --------------------------------------------------------

        const { Wallet } =
            require("ethers");


        const manufacturerWallet =
            new Wallet(
                process.env.MANUFACTURER_PRIVATE_KEY
            );


        // --------------------------------------------------------
        // Get product IDs from blockchain
        // --------------------------------------------------------

        const productCodes =
            await getManufacturerProducts(
                manufacturerWallet.address
            );


        // --------------------------------------------------------
        // Get complete product data
        // --------------------------------------------------------

        const products = [];


        for (
            const productCode of productCodes
        ) {

            try {

                const product =
                    await getProductFromBlockchain(
                        productCode
                    );


                const totalScans =
                    await Verification.countDocuments({
                        productCode:
                            String(productCode)
                    });


                products.push({

                    productCode:
                        product.productId,

                    productName:
                        product.productName,

                    category:
                        product.category,

                    brandName:
                        product.brandName,

                    batchNumber:
                        product.batchNumber,

                    manufacturingDate:
                        product.manufacturingDate,

                    manufacturer:
                        product.manufacturer,

                    productHash:
                        product.productHash,

                    imageHash:
                        product.imageHash,

                    qrHash:
                        product.qrHash,

                    timestamp:
                        product.timestamp.toString(),

                    status:
    product.status === 1
        ? "GENUINE"
        : product.status === 2
            ? "SUSPICIOUS"
            : product.status === 3
                ? "DEACTIVATED"
                : "UNKNOWN",

                    totalScans
                });


            } catch (productError) {

                console.error(
                    `Could not fetch ${productCode}:`,
                    productError.message
                );
            }
        }


        return res.status(200).json({

            count: products.length,

            products
        });


    } catch (error) {

        console.error(
            "Get my products error:",
            error
        );


        return res.status(500).json({

            message:
                "Server error while fetching products"
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

    registerProduct,

    verifyProductByQR,

    verifyProductImage,

    getMyProducts,

    deleteProduct,
    getConsumerStats
};