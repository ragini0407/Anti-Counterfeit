const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");

const MIN_PASSWORD_LENGTH = 16;

const readBootstrapConfig = (env) => {
    const name = String(env.ADMIN_BOOTSTRAP_NAME || "").trim();
    const email = String(env.ADMIN_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
    const password = typeof env.ADMIN_BOOTSTRAP_PASSWORD === "string"
        ? env.ADMIN_BOOTSTRAP_PASSWORD
        : "";

    if (!name || !email || !password) {
        const error = new Error("One-time admin provisioning configuration is incomplete");
        error.code = "BOOTSTRAP_CONFIGURATION_REQUIRED";
        throw error;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        const error = new Error("Admin provisioning email is invalid");
        error.code = "BOOTSTRAP_EMAIL_INVALID";
        throw error;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        const error = new Error(`Admin provisioning password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        error.code = "BOOTSTRAP_PASSWORD_TOO_SHORT";
        throw error;
    }

    return { name, email, password };
};

const createAdmin = async ({
    env = process.env,
    User = require("./models/User"),
    bcryptImpl = bcrypt,
    connectDB = require("./config/db")
} = {}) => {
    await connectDB();
    // Ensure the single-admin index exists before checking and inserting. If legacy
    // data violates the invariant, index creation fails closed instead of seeding.
    if (typeof User.init === "function") await User.init();

    const existingAdmin = await User.findOne({ role: "ADMIN" });
    if (existingAdmin) return { created: false, reason: "ADMIN_ALREADY_EXISTS" };

    const config = readBootstrapConfig(env);
    const existingEmail = await User.findOne({ email: config.email });
    if (existingEmail) {
        const error = new Error("The configured admin email is already in use");
        error.code = "BOOTSTRAP_EMAIL_IN_USE";
        throw error;
    }

    const passwordHash = await bcryptImpl.hash(config.password, 12);
    try {
        await User.create({
            name: config.name,
            email: config.email,
            password: passwordHash,
            role: "ADMIN",
            status: "ACTIVE"
        });
    } catch (error) {
        if (error.code === 11000) {
            const winner = await User.findOne({ role: "ADMIN" });
            if (winner) return { created: false, reason: "ADMIN_ALREADY_EXISTS" };
            const duplicateEmail = new Error("The configured admin email is already in use");
            duplicateEmail.code = "BOOTSTRAP_EMAIL_IN_USE";
            throw duplicateEmail;
        }
        throw error;
    }
    return { created: true };
};

const main = async () => {
    dotenv.config();
    try {
        const result = await createAdmin();
        delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
        console.log(result.created
            ? "Admin provisioning completed. Remove the one-time bootstrap configuration from the invoking environment."
            : "An admin already exists; no account was created.");
        process.exitCode = 0;
    } catch (error) {
        const safeCode = /^[A-Z_]+$/.test(String(error.code || "")) ? error.code : "PROVISIONING_FAILED";
        console.error(`Admin provisioning failed (${safeCode}). No credential values were logged.`);
        process.exitCode = 1;
    } finally {
        await require("mongoose").disconnect().catch(() => {});
    }
};

if (require.main === module) main();

module.exports = { MIN_PASSWORD_LENGTH, readBootstrapConfig, createAdmin };
