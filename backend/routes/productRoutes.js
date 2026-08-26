const express = require("express");
const router = express.Router();

const { registerProduct,verifyProductByQR,verifyProductImage } = require("../controllers/productController");

const {
    protect,
    authorizeRoles
} = require("../middleware/authMiddleware");

const upload = require("../middleware/uploadMiddleware");

router.post(
    "/",
    protect,
    authorizeRoles("MANUFACTURER"),
    upload.single("referenceImage"),
    registerProduct
);

router.get(
    "/verify/:productCode",
    verifyProductByQR
);

router.post(
    "/verify-image/:productCode",
    upload.single("productImage"),
    verifyProductImage
);

module.exports = router;