const express = require("express");
const router = express.Router();

const {
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
} = require("../controllers/productController");

const {
    protect,
    authorizeRoles
} = require("../middleware/authMiddleware");

const upload = require("../middleware/uploadMiddleware");
const {
    getAssignedProducts,
    prepareLifecycleAction,
    claimLifecycleSubmission,
    releaseLifecycleSubmission,
    confirmLifecycleAction
} = require("../controllers/lifecycleController");

router.post(
    "/prepare",
    protect,
    authorizeRoles("MANUFACTURER"),
    upload.single("referenceImage"),
    prepareProductRegistration
);

router.post(
    "/confirm",
    protect,
    authorizeRoles("MANUFACTURER"),
    confirmProductRegistration
);

router.get(
    "/registrations/pending",
    protect,
    authorizeRoles("MANUFACTURER"),
    getPendingProductRegistrations
);

router.post(
    "/registrations/:registrationId/claim-mint",
    protect,
    authorizeRoles("MANUFACTURER"),
    claimProductRegistrationMint
);

router.post(
    "/verify/:productCode",
    verifyProductByQR
);

router.post(
    "/verify-code/:productCode",
    verifyProductByCode
);

router.post(
    "/verify-image/:productCode",
    upload.singleImage("productImage"),
    verifyProductImage
);

router.get(
    "/my-products",
    protect,
    authorizeRoles("MANUFACTURER"),
    getMyProducts
);
router.get(
    "/partners",
    protect,
    authorizeRoles("MANUFACTURER"),
    getApprovedPartners
);
router.get(
    "/lifecycle",
    protect,
    authorizeRoles("MANUFACTURER", "DISTRIBUTOR", "RETAILER"),
    getAssignedProducts
);
router.post(
    "/:productCode/lifecycle/prepare",
    protect,
    authorizeRoles("MANUFACTURER", "DISTRIBUTOR", "RETAILER"),
    prepareLifecycleAction
);
router.post(
    "/lifecycle/operations/:operationId/claim",
    protect,
    authorizeRoles("MANUFACTURER", "DISTRIBUTOR", "RETAILER"),
    claimLifecycleSubmission
);
router.post(
    "/lifecycle/operations/:operationId/release",
    protect,
    authorizeRoles("MANUFACTURER", "DISTRIBUTOR", "RETAILER"),
    releaseLifecycleSubmission
);
router.post(
    "/lifecycle/operations/:operationId/confirm",
    protect,
    authorizeRoles("MANUFACTURER", "DISTRIBUTOR", "RETAILER"),
    confirmLifecycleAction
);
router.get(
    "/consumer-stats",
    protect,
    getConsumerStats
)
router.delete(
    "/:productCode",
    protect,
    authorizeRoles("MANUFACTURER"),
    deleteProduct
);


module.exports = router;
