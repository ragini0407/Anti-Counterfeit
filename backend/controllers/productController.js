const Product = require("../models/Product");
const Manufacturer = require("../models/Manufacturer");
const path = require("path");
const fs = require("fs/promises");
const { extractVisualFeatures,compareVisualFeatures } = require("../services/visualFeatureService");
const {
    generateProductQR
} = require("../services/qrService");

const registerProduct = async (req, res) => {
    try {
        const {
            productName,
            category,
            brandName,
            batchNumber,
            manufacturingDate
        } = req.body;

        // Check required product fields
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

        // Check reference image
        if (!req.file) {
            return res.status(400).json({
                message: "Genuine product reference image is required"
            });
        }

        // Find manufacturer connected to logged-in user
        const manufacturer = await Manufacturer.findOne({
            userId: req.user.userId
        });

        if (!manufacturer) {
            return res.status(404).json({
                message: "Manufacturer profile not found"
            });
        }

        // Manufacturer must be verified
        if (manufacturer.verificationStatus !== "VERIFIED") {
            return res.status(403).json({
                message: "Manufacturer approval required"
            });
        }

        // Generate next product code
        const lastProduct = await Product.findOne()
            .sort({ createdAt: -1 });

        let nextNumber = 1;

        if (lastProduct && lastProduct.productCode) {
            const lastNumber = parseInt(
                lastProduct.productCode.replace("FPD", ""),
                10
            );

            if (!isNaN(lastNumber)) {
                nextNumber = lastNumber + 1;
            }
        }

        const productCode = `FPD${String(nextNumber).padStart(4, "0")}`;

        // Save image path
       const referenceImage =
    `/uploads/products/${req.file.filename}`;

// Get the actual uploaded image path
const imagePath = path.join(
    process.cwd(),
    "uploads",
    "products",
    req.file.filename
);

// Extract visual features
const visualFeatures = await extractVisualFeatures(imagePath);
const qrCode = await generateProductQR(productCode);
// Create product
const product = await Product.create({
    productCode,
    productName,
    category,
    brandName,
    batchNumber,
    manufacturingDate,
    manufacturerId: manufacturer._id,
    referenceImage,
    visualFeatures,
    qrCode
});

        res.status(201).json({
            message: "Product registered successfully",
            product
        });

    } catch (error) {
        console.error("Product registration error:", error);

        res.status(500).json({
            message: "Product registration failed"
        });
    }
};

const verifyProductByQR = async (req, res) => {
    try {
        const { productCode } = req.params;

        const product = await Product.findOne({ productCode });

        if (!product) {
            return res.status(404).json({
                verified: false,
                status: "FAKE",
                message: "Product is not registered"
            });
        }

        // Count this QR scan
        product.totalScans += 1;
        await product.save();

        return res.status(200).json({
            verified: true,
            status: product.verificationStatus,
            message: "Product is registered",
            product: {
                productCode: product.productCode,
                productName: product.productName,
                category: product.category,
                brandName: product.brandName,
                batchNumber: product.batchNumber,
                manufacturingDate: product.manufacturingDate,
                totalScans: product.totalScans
            }
        });

    } catch (error) {
        console.error("QR verification error:", error);

        return res.status(500).json({
            verified: false,
            message: "Server error during QR verification"
        });
    }
};
const verifyProductImage = async (req, res) => {
    let uploadedFilePath = null;

    try {
        const { productCode } = req.params;

        if (!req.file) {
            return res.status(400).json({
                verified: false,
                message: "Product image is required"
            });
        }

        // Remember the uploaded file so we can delete it later
        uploadedFilePath = req.file.path;

        const product = await Product.findOne({ productCode });

        if (!product) {
            return res.status(404).json({
                verified: false,
                status: "FAKE",
                message: "Product is not registered"
            });
        }

        if (
            !product.visualFeatures ||
            product.visualFeatures.length === 0
        ) {
            return res.status(400).json({
                verified: false,
                message: "Reference visual features are not available"
            });
        }

        // Extract features from consumer image
        const testFeatures =
            await extractVisualFeatures(uploadedFilePath);

        // Compare with genuine features
        const similarity = compareVisualFeatures(
            product.visualFeatures,
            testFeatures
        );

        let status;

        if (similarity >= 90) {
            status = "GENUINE";
        } else if (similarity >= 70) {
            status = "SUSPICIOUS";
        } else {
            status = "FAKE";
        }

        return res.status(200).json({
            verified: status === "GENUINE",
            status,
            similarity,
            product: {
                productCode: product.productCode,
                productName: product.productName,
                brandName: product.brandName
            }
        });

    } catch (error) {
        console.error(
            "Product image verification error:",
            error
        );

        return res.status(500).json({
            verified: false,
            message: "Server error during image verification"
        });

    } finally {
        // Delete consumer verification image after processing
        if (uploadedFilePath) {
            try {
                await fs.unlink(uploadedFilePath);
                console.log("Verification image deleted");
            } catch (deleteError) {
                console.error(
                    "Could not delete verification image:",
                    deleteError.message
                );
            }
        }
    }
};
module.exports = {
    registerProduct,
    verifyProductByQR,
    verifyProductImage
};