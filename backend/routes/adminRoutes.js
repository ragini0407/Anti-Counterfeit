const express = require("express");

const {
    getPendingManufacturers,
    approveManufacturer,
    rejectManufacturer,
    getPendingPartners,
    approvePartner,
    rejectPartner,
    getAdminDashboard,
    getAdminVerifications
} = require("../controllers/adminController");

const {
    protect,
    authorizeRoles
} = require("../middleware/authMiddleware");

const router = express.Router();
const { getAdminProductLifecycle } = require("../controllers/lifecycleController");


// =====================================================
// ADMIN DASHBOARD
// =====================================================

router.get(
    "/dashboard",
    protect,
    authorizeRoles("ADMIN"),
    getAdminDashboard
);

router.get(
    "/verifications",
    protect,
    authorizeRoles("ADMIN"),
    getAdminVerifications
);

router.get(
    "/products/:productCode/lifecycle",
    protect,
    authorizeRoles("ADMIN"),
    getAdminProductLifecycle
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
// =====================================================
// PENDING DISTRIBUTORS / RETAILERS
// =====================================================

router.get(
    "/partners/pending",
    protect,
    authorizeRoles("ADMIN"),
    getPendingPartners
);


// =====================================================
// APPROVE DISTRIBUTOR / RETAILER
// =====================================================

router.put(
    "/partners/:id/approve",
    protect,
    authorizeRoles("ADMIN"),
    approvePartner
);


// =====================================================
// REJECT DISTRIBUTOR / RETAILER
// =====================================================

router.put(
    "/partners/:id/reject",
    protect,
    authorizeRoles("ADMIN"),
    rejectPartner
);

module.exports = router;
