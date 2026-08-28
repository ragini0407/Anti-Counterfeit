const express = require("express");

const {
    getPendingManufacturers,
    approveManufacturer,
    rejectManufacturer,
    getAdminDashboard
} = require("../controllers/adminController");

const {
    protect,
    authorizeRoles
} = require("../middleware/authMiddleware");

const router = express.Router();


// =====================================================
// ADMIN DASHBOARD
// =====================================================

router.get(
    "/dashboard",
    protect,
    authorizeRoles("ADMIN"),
    getAdminDashboard
);


// =====================================================
// PENDING MANUFACTURERS
// =====================================================

router.get(
    "/manufacturers/pending",
    protect,
    authorizeRoles("ADMIN"),
    getPendingManufacturers
);


// =====================================================
// APPROVE MANUFACTURER
// =====================================================

router.put(
    "/manufacturers/:id/approve",
    protect,
    authorizeRoles("ADMIN"),
    approveManufacturer
);


// =====================================================
// REJECT MANUFACTURER
// =====================================================

router.put(
    "/manufacturers/:id/reject",
    protect,
    authorizeRoles("ADMIN"),
    rejectManufacturer
);


module.exports = router;