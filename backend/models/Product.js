const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
    {
        productCode: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        productName: {
            type: String,
            required: true,
            trim: true
        },

        category: {
            type: String,
            required: true,
            trim: true
        },

        brandName: {
            type: String,
            required: true,
            trim: true
        },

        batchNumber: {
            type: String,
            required: true,
            trim: true
        },

        manufacturingDate: {
            type: Date,
            required: true
        },

        manufacturerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Manufacturer",
            required: true
        },

        referenceImage: {
            type: String,
            default: ""
        },

        visualFeatures: {
            type: [Number],
            default: []
        },

        blockchainHash: {
            type: String,
            default: ""
        },

        verificationStatus: {
            type: String,
            enum: ["GENUINE", "SUSPICIOUS", "FAKE"],
            default: "GENUINE"
        },

        totalScans: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Product", productSchema);n