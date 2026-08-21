const Product = require("../models/Product");
const Manufacturer = require("../models/Manufacturer");

const registerProduct = async (req, res) => {
    try {
        const {
            productName,
            category,
            brandName,
            batchNumber,
            manufacturingDate
        } = req.body;

        // Check required fields
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

        // Create product
        const product = await Product.create({
            productCode,
            productName,
            category,
            brandName,
            batchNumber,
            manufacturingDate,
            manufacturerId: manufacturer._id
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

module.exports = {
    registerProduct
};