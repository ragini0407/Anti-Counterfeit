const express = require("express");

const {
    registerManufacturer,
    registerDistributor,
    registerRetailer,
    loginUser
} = require("../controllers/authController");
const {
    createWalletChallenge,
    confirmWalletBinding,
    createWalletRebindChallenge,
    confirmWalletRebind
} = require("../controllers/walletController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register-manufacturer", registerManufacturer);

router.post("/register-distributor", registerDistributor);

router.post("/register-retailer", registerRetailer);

router.post("/login", loginUser);

router.post(
    "/wallet/challenge",
    protect,
    authorizeRoles("MANUFACTURER", "DISTRIBUTOR", "RETAILER"),
    createWalletChallenge
);

router.post(
    "/wallet/confirm",
    protect,
    authorizeRoles("MANUFACTURER", "DISTRIBUTOR", "RETAILER"),
    confirmWalletBinding
);

router.post(
    "/wallet/rebind/challenge",
    protect,
    authorizeRoles("MANUFACTURER", "DISTRIBUTOR", "RETAILER"),
    createWalletRebindChallenge
);

router.post(
    "/wallet/rebind/confirm",
    protect,
    authorizeRoles("MANUFACTURER", "DISTRIBUTOR", "RETAILER"),
    confirmWalletRebind
);

module.exports = router;
