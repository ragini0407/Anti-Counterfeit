const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");

const connectDB = require("./config/db");
const User = require("./models/User");

dotenv.config();

const createAdmin = async () => {
    try {
        await connectDB();

        const existingAdmin = await User.findOne({
            role: "ADMIN"
        });

        if (existingAdmin) {
            console.log("Admin already exists.");
            process.exit(0);
        }

        const hashedPassword = await bcrypt.hash(
            "AdminPassword123",
            10
        );

        const admin = await User.create({
            name: "System Administrator",
            email: "admin@fakeproduct.com",
            password: hashedPassword,
            role: "ADMIN",
            status: "ACTIVE"
        });

        console.log("Admin created successfully:");
        console.log("Email:", admin.email);

        process.exit(0);

    } catch (error) {
        console.error("Admin creation failed:", error.message);
        process.exit(1);
    }
};

createAdmin();