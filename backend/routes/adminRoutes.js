const express = require("express");

const {
    getPendingManufacturers,
    approveManufacturer,
    rejectManufacturer
} = require("../controllers/adminController");
const {
    protect,
    authorizeRoles
} = require("../middleware/authMiddleware");

const router = express.Router();

router.get(
    "/manufacturers/pending",
    protect,
    authorizeRoles("ADMIN"),
    getPendingManufacturers
);
router.put(
    "/manufacturers/:id/approve",
    protect,
    authorizeRoles("ADMIN"),
    approveManufacturer
);

router.put(
    "/manufacturers/:id/reject",
    protect,
    authorizeRoles("ADMIN"),
    rejectManufacturer
);
module.exports = router;