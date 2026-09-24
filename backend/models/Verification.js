const mongoose = require("mongoose");

const verificationSchema = new mongoose.Schema(
    {
        productCode: {
            type: String,
            required: true,
            trim: true
        },

        verificationType: {
            type: String,
            enum: ["QR", "IMAGE"],
            required: true
        },

        status: {
    type: String,
    enum: [
        "GENUINE",
        "SUSPICIOUS",
        "FAKE",
        "NOT_REGISTERED",
        "DEACTIVATED",
        "FLAGGED",
        "INVALID_QR"
    ],
    required: true
},

        similarity: {
            type: Number,
            default: null
        },

        aiConfidence: {
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