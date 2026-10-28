const mongoose = require("mongoose");

const preparedTransactionSchema = new mongoose.Schema(
    {
        to: { type: String, required: true, lowercase: true },
        data: { type: String, required: true },
        value: { type: String, required: true },
        chainId: { type: Number, required: true },
        registryVersion: { type: Number, enum: [1, 2], default: undefined }
    },
    { _id: false }
);

const productFieldsSchema = new mongoose.Schema(
    {
        productName: { type: String, required: true, trim: true },
        category: { type: String, required: true, trim: true },
        brandName: { type: String, required: true, trim: true },
        batchNumber: { type: String, required: true, trim: true },
        manufacturingDate: { type: String, required: true },
        price: { type: Number, default: null, min: 0 },
        description: { type: String, default: "", trim: true }
    },
    { _id: false }
);

const productRegistrationSchema = new mongoose.Schema(
    {
        registrationId: { type: String, required: true, unique: true, index: true },
        idempotencyKey: { type: String, required: true },
        activeRequestKey: { type: String, unique: true, sparse: true },
        manufacturerUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        manufacturerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Manufacturer",
            required: true
        },
        productCode: { type: String, required: true, unique: true },
        product: { type: productFieldsSchema, required: true },
        manufacturerWallet: { type: String, required: true, lowercase: true },
        distributorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SupplyChainPartner",
            required: true
        },
        distributorWallet: { type: String, required: true, lowercase: true },
        retailerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SupplyChainPartner",
            required: true
        },
        retailerWallet: { type: String, required: true, lowercase: true },
        productHash: { type: String, required: true },
        referenceImageHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
        referenceImagePath: { type: String, required: true },
        ipfsImageHash: { type: String, default: "" },
        preparedTransaction: { type: preparedTransactionSchema, required: true },
        registryVersion: { type: Number, enum: [1, 2], default: undefined },
        status: {
            type: String,
            enum: ["PREPARED", "MINT_SUBMITTING", "MINT_CONFIRMED", "COMPLETE"],
            default: "PREPARED",
            required: true,
            index: true
        },
        transactionHash: { type: String, unique: true, sparse: true },
        mintedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null }
    },
    { timestamps: true }
);

productRegistrationSchema.index(
    { manufacturerUserId: 1, idempotencyKey: 1 },
    { unique: true }
);

module.exports = mongoose.model("ProductRegistration", productRegistrationSchema);
