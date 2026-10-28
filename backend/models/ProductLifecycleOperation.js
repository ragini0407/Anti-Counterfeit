const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
    to: { type: String, required: true, lowercase: true },
    data: { type: String, required: true },
    value: { type: String, required: true },
    chainId: { type: Number, required: true }
}, { _id: false });

const productLifecycleOperationSchema = new mongoose.Schema({
    operationId: { type: String, required: true, unique: true },
    activeProductKey: { type: String, unique: true, sparse: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productCode: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    actorRole: { type: String, enum: ["MANUFACTURER", "DISTRIBUTOR", "RETAILER"], required: true },
    actorWallet: { type: String, required: true, lowercase: true },
    action: {
        type: String,
        enum: ["DISPATCH_TO_DISTRIBUTOR", "RECEIVE_BY_DISTRIBUTOR", "DISPATCH_TO_RETAILER", "RECEIVE_BY_RETAILER", "RECORD_SALE"],
        required: true
    },
    previousState: { type: Number, required: true },
    newState: { type: Number, required: true },
    counterparty: { type: String, required: true, lowercase: true },
    custodian: { type: String, required: true, lowercase: true },
    registryVersion: { type: Number, enum: [2], required: true },
    registryAddress: { type: String, required: true, lowercase: true },
    chainId: { type: Number, required: true },
    submissionProtocolVersion: { type: Number, enum: [2], default: null },
    preparedTransaction: { type: transactionSchema, required: true },
    status: { type: String, enum: ["PREPARED", "SUBMITTING", "CONFIRMED", "FAILED", "REVIEW_REQUIRED"], required: true, index: true },
    expiresAt: { type: Date, required: true },
    transactionHash: { type: String, unique: true, sparse: true },
    observedTransactionHashes: { type: [String], default: [] },
    submissionAttemptId: { type: String, default: null },
    submissionStartedAt: { type: Date, default: null },
    lastReleasedSubmissionAttemptId: { type: String, default: null },
    failureCode: { type: String, enum: ["TRANSACTION_REVERTED", "CONFIRMATION_REJECTED"], default: null },
    reviewReason: { type: String, default: null },
    reviewRequiredAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    logIndex: { type: Number, default: null },
    eventTimestamp: { type: Date, default: null },
    blockNumber: { type: Number, default: null }
}, { timestamps: true });

productLifecycleOperationSchema.index({ productCode: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("ProductLifecycleOperation", productLifecycleOperationSchema);
