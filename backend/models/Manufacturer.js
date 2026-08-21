const mongoose = require("mongoose");

const manufacturerSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        companyName: {
            type: String,
            required: true,
            trim: true
        },

        registrationNumber: {
            type: String,
            required: true,
            trim: true
        },

        address: {
            type: String,
            required: true,
            trim: true
        },

        contactNumber: {
            type: String,
            required: true,
            trim: true
        },

        documents: {
            type: String,
            default: ""
        },

        verificationStatus: {
            type: String,
            enum: ["PENDING", "VERIFIED", "REJECTED", "SUSPENDED"],
            default: "PENDING"
        },

        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        verifiedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Manufacturer", manufacturerSchema);