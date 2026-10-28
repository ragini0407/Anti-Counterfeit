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

        price: {
            type: Number,
            min: 0,
            default: null
        },

        description: {
            type: String,
            default: "",
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

        imageHash: {
            type: String,
            required: true
        },

        productHash: {
            type: String,
            required: true
        },

        ipfsImageHash: {
            type: String,
            default: ""
        },

        manufacturerWallet: {
            type: String,
            required: true,
            lowercase: true
        },

        authorizedDistributor: {
            type: String,
            required: true,
            lowercase: true
        },

        authorizedDistributorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SupplyChainPartner",
            required: true
        },

        authorizedRetailer: {
            type: String,
            required: true,
            lowercase: true
        },

        authorizedRetailerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SupplyChainPartner",
            required: true
        },

        transactionHash: {
            type: String,
            required: true,
            unique: true
        },

        // Historical records without these fields resolve to the configured V1 registry.
        registryVersion: {
            type: Number,
            enum: [1, 2],
            default: undefined
        },

        registryAddress: {
            type: String,
            lowercase: true,
            default: undefined
        },

        chainId: {
            type: Number,
            default: undefined
        },

        mintedAt: {
            type: Date,
            required: true
        },

        qrCode: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Product", productSchema);
