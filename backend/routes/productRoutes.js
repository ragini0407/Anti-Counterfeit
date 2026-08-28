const express = require("express");
const router = express.Router();

const { registerProduct,verifyProductByQR,verifyProductImage,getMyProducts } = require("../controllers/productController");

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

router.post(
    "/verify/:productCode",
    verifyProductByQR
);

router.post(
    "/verify-image/:productCode",
    upload.single("productImage"),
    verifyProductImage
);

router.get(
    "/my-products",
    protect,
    authorizeRoles("MANUFACTURER"),
    getMyProducts
);

module.exports = router;