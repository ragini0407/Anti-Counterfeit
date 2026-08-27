const mongoose = require("mongoose");

const verificationSchema = new mongoose.Schema(
    {
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },

        productCode: {
            type: String,
            required: true
        },

        verificationType: {
            type: String,
            enum: ["QR", "IMAGE"],
            required: true
        },

        status: {
            type: String,
            enum: ["GENUINE", "SUSPICIOUS", "FAKE"],
            required: true
        },

        similarity: {
            type: Number,
            default: null
        },

        location: {
            latitude: {
                type: Number,
                required: true
            },

            longitude: {
                type: Number,
                required: true
            }
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Verification", verificationSchema);