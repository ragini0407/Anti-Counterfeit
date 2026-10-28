const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Manufacturer = require("../models/Manufacturer");
const SupplyChainPartner = require("../models/SupplyChainPartner");

const registerManufacturer = async (req, res) => {
    try {
        const {
            name,
            email,
            password,
            companyName,
            registrationNumber,
            address,
            contactNumber
        } = req.body;

        // Check required fields
        if (
            !name ||
            !email ||
            !password ||
            !companyName ||
            !registrationNumber ||
            !address ||
            !contactNumber
        ) {
            return res.status(400).json({
                message: "All required fields must be provided"
            });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({
                message: "Email is already registered"
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role: "MANUFACTURER",
            status: "PENDING"
        });

        // Create manufacturer profile
        const manufacturer = await Manufacturer.create({
            userId: user._id,
            companyName,
            registrationNumber,
            address,
            contactNumber,
            verificationStatus: "PENDING"
        });

        res.status(201).json({
            message: "Manufacturer registration submitted successfully",
            manufacturerId: manufacturer._id,
            status: "PENDING"
        });

    } catch (error) {
        console.error("Manufacturer registration error:", error);

        res.status(500).json({
            message: "Server error during registration"
        });
    }
};


// Register Distributor
const registerDistributor = async (req, res) => {
    try {
        const {
            name,
            email,
            password,
            companyName,
            registrationNumber,
            address,
            contactNumber
        } = req.body;

        // Check required fields
        if (
            !name ||
            !email ||
            !password ||
            !companyName ||
            !registrationNumber ||
            !address ||
            !contactNumber
        ) {
            return res.status(400).json({
                message: "All required fields must be provided"
            });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({
                message: "Email is already registered"
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create distributor user
        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role: "DISTRIBUTOR",
            status: "PENDING"
        });

        // Create distributor profile
        const distributor = await SupplyChainPartner.create({
            userId: user._id,
            partnerType: "DISTRIBUTOR",
            companyName,
            registrationNumber,
            address,
            contactNumber,
            verificationStatus: "PENDING"
        });

        res.status(201).json({
            message: "Distributor registration submitted successfully",
            distributorId: distributor._id,
            status: "PENDING"
        });

    } catch (error) {
        console.error("Distributor registration error:", error);

        res.status(500).json({
            message: "Server error during distributor registration"
        });
    }
};


// Register Retailer
const registerRetailer = async (req, res) => {
    try {
        const {
            name,
            email,
            password,
            companyName,
            registrationNumber,
            address,
            contactNumber
        } = req.body;

        // Check required fields
        if (
            !name ||
            !email ||
            !password ||
            !companyName ||
            !registrationNumber ||
            !address ||
            !contactNumber
        ) {
            return res.status(400).json({
                message: "All required fields must be provided"
            });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({
                message: "Email is already registered"
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create retailer user
        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role: "RETAILER",
            status: "PENDING"
        });

        // Create retailer profile
        const retailer = await SupplyChainPartner.create({
            userId: user._id,
            partnerType: "RETAILER",
            companyName,
            registrationNumber,
            address,
            contactNumber,
            verificationStatus: "PENDING"
        });

        res.status(201).json({
            message: "Retailer registration submitted successfully",
            retailerId: retailer._id,
            status: "PENDING"
        });

    } catch (error) {
        console.error("Retailer registration error:", error);

        res.status(500).json({
            message: "Server error during retailer registration"
        });
    }
};


// Login
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check required fields
        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        // Find user
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        // Check password
        const isPasswordCorrect = await bcrypt.compare(
            password,
            user.password
        );

        if (!isPasswordCorrect) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        // Check account status
        if (user.status !== "ACTIVE") {
            return res.status(403).json({
                message: `Account is ${user.status.toLowerCase()}`
            });
        }

        // Create JWT
        const token = jwt.sign(
            {
                userId: user._id,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "1d"
            }
        );

        res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                walletAddress: user.walletAddress || null,
                walletVerifiedAt: user.walletVerifiedAt || null
            }
        });

    } catch (error) {
        console.error("Login error:", error);

        res.status(500).json({
            message: "Server error during login"
        });
    }
};


module.exports = {
    registerManufacturer,
    registerDistributor,
    registerRetailer,
    loginUser
};
