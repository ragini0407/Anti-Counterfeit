const express = require("express");

const {
    registerManufacturer,
    loginUser
} = require("../controllers/authController");

const router = express.Router();

router.post("/register-manufacturer", registerManufacturer);

router.post("/login", loginUser);

module.exports = router;