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
            enum: ["ADMIN", "MANUFACTURER"],
            required: true
        },

        status: {
            type: String,
            enum: ["ACTIVE", "PENDING", "REJECTED", "SUSPENDED"],
            default: "PENDING"
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("User", userSchema);