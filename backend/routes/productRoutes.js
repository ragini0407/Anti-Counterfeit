const express = require("express");
const router = express.Router();

const { registerProduct } = require("../controllers/productController");

const {
    protect,
    authorizeRoles
} = require("../middleware/authMiddleware");

router.post(
    "/",
    protect,
    authorizeRoles("MANUFACTURER"),
    registerProduct
);

module.exports = router;