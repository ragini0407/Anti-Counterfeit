const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },

        password: {
            type: String,
            required: true
        },

        role: {
            type: String,
            enum: [
                "ADMIN",
                "MANUFACTURER",
                "DISTRIBUTOR",
                "RETAILER"
            ],
            required: true
        },

        status: {
            type: String,
            enum: ["ACTIVE", "PENDING", "REJECTED", "SUSPENDED"],
            default: "PENDING"
        },

        walletAddress: {
            type: String,
            lowercase: true,
            trim: true,
            unique: true,
            sparse: true,
            default: undefined
        },

        walletVerifiedAt: {
            type: Date,
            default: null
        },

        walletChallenge: {
            type: String,
            select: false
        },

        walletChallengeAddress: {
            type: String,
            select: false
        },

        walletChallengeExpiresAt: {
            type: Date,
            select: false
        },

        walletRebindChallenge: {
            type: String,
            select: false
        },

        walletRebindChallengeAddress: {
            type: String,
            select: false
        },

        walletRebindChallengeCurrentAddress: {
            type: String,
            select: false
        },

        walletRebindChallengeExpiresAt: {
            type: Date,
            select: false
        }
    },
    {
        timestamps: true
    }
);

// Enforce the single website administrator invariant at the database layer.
// This remains safe across multiple seed-admin processes, unlike a read-before-create check.
userSchema.index(
    { role: 1 },
    {
        unique: true,
        partialFilterExpression: { role: "ADMIN" },
        name: "unique_website_admin_role"
    }
);

module.exports = mongoose.model("User", userSchema);
