const { ethers } = require("ethers");
const crypto = require("crypto");
const Product = require("../models/Product");
const ProductRegistration = require("../models/ProductRegistration");
const ProductLifecycleOperation = require("../models/ProductLifecycleOperation");
const User = require("../models/User");
const Manufacturer = require("../models/Manufacturer");
const SupplyChainPartner = require("../models/SupplyChainPartner");
const Verification = require("../models/Verification");
const blockchainV2 = require("./blockchainV2Service");
const blockchainV1 = require("./blockchainService");
const { resolveProductRegistryIdentity } = require("./productRegistryIdentity");

const LIFECYCLE = Object.freeze({
    DISPATCH_TO_DISTRIBUTOR: { role: "MANUFACTURER", from: 0, to: 1 },
    RECEIVE_BY_DISTRIBUTOR: { role: "DISTRIBUTOR", from: 1, to: 2 },
    DISPATCH_TO_RETAILER: { role: "DISTRIBUTOR", from: 2, to: 3 },
    RECEIVE_BY_RETAILER: { role: "RETAILER", from: 3, to: 4 },
    RECORD_SALE: { role: "RETAILER", from: 4, to: 5 }
});
const STATE_LABELS = [
    "MINTED", "DISPATCHED_TO_DISTRIBUTOR", "RECEIVED_BY_DISTRIBUTOR",
    "DISPATCHED_TO_RETAILER", "RECEIVED_BY_RETAILER", "SOLD", "FLAGGED_COUNTERFEIT"
];
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const plain = (record) => record?.toObject ? record.toObject() : record;
const addrEq = (left, right) => Boolean(left && right) && String(left).toLowerCase() === String(right).toLowerCase();

const createDependencies = (overrides = {}) => ({
    Product,
    ProductRegistration,
    ProductLifecycleOperation,
    User,
    Manufacturer,
    SupplyChainPartner,
    Verification,
    blockchainV2,
    blockchainV1,
    ...overrides
});

const getActorContext = async (userId, role, deps) => {
    const user = await deps.User.findById(userId);
    if (!user || user.status !== "ACTIVE" || user.role !== role) {
        throw fail(`An active ${role.toLowerCase()} account is required`, 403);
    }
    if (!user.walletAddress || !user.walletVerifiedAt) {
        throw fail("Bind and verify the account wallet before using lifecycle actions", 403);
    }
    const walletAddress = ethers.getAddress(user.walletAddress);
    let profile;
    if (role === "MANUFACTURER") {
        profile = await deps.Manufacturer.findOne({ userId });
    } else {
        profile = await deps.SupplyChainPartner.findOne({ userId, partnerType: role });
    }
    if (!profile || profile.verificationStatus !== "VERIFIED") {
        throw fail("An approved profile is required for this lifecycle action", 403);
    }
    const expectedRole = role === "MANUFACTURER" ? 1 : role === "DISTRIBUTOR" ? 2 : 3;
    if (await deps.blockchainV2.getRole(walletAddress) !== expectedRole) {
        throw fail("Bound wallet does not have the required role on ProductRegistry V2", 403);
    }
    return { user, profile, walletAddress };
};

const findAssignedProduct = async (productCode, actor, role, deps) => {
    const filter = { productCode, registryVersion: 2 };
    if (role === "MANUFACTURER") filter.manufacturerId = actor.profile._id;
    if (role === "DISTRIBUTOR") filter.authorizedDistributorId = actor.profile._id;
    if (role === "RETAILER") filter.authorizedRetailerId = actor.profile._id;
    const query = deps.Product.findOne(filter);
    return query?.lean ? query.lean() : query;
};

const validateProductIdentity = (product, chainProduct) => {
    if (!chainProduct ||
        chainProduct.productId !== product.productCode ||
        chainProduct.productHash !== product.productHash ||
        String(chainProduct.manufacturerId) !== String(product.manufacturerId) ||
        !addrEq(chainProduct.authorizedDistributor, product.authorizedDistributor) ||
        !addrEq(chainProduct.authorizedRetailer, product.authorizedRetailer) ||
        !addrEq(chainProduct.manufacturer, product.manufacturerWallet)) {
        throw fail("MongoDB product identity does not match ProductRegistry V2", 409);
    }
};

const findCompletedRegistration = async (product, deps) => {
    if (!product?.transactionHash) return null;
    const query = deps.ProductRegistration.findOne({
        productCode: product.productCode,
        transactionHash: product.transactionHash,
        status: "COMPLETE"
    });
    return query?.lean ? query.lean() : query;
};

const resolveProductIdentity = async (product, deps) => resolveProductRegistryIdentity({
    product,
    registration: await findCompletedRegistration(product, deps),
    blockchainV1: deps.blockchainV1,
    blockchainV2: deps.blockchainV2
});

const expectedTransition = (action, chainProduct) => {
    const spec = LIFECYCLE[action];
    if (!spec || chainProduct.state !== spec.from) {
        throw fail("Product is not in the state required for this action", 409);
    }
    const zero = ethers.ZeroAddress;
    if (action === "DISPATCH_TO_DISTRIBUTOR") {
        return { ...spec, counterparty: chainProduct.authorizedDistributor, custodian: chainProduct.currentCustodian };
    }
    if (action === "RECEIVE_BY_DISTRIBUTOR") {
        return { ...spec, counterparty: chainProduct.manufacturer, custodian: chainProduct.authorizedDistributor };
    }
    if (action === "DISPATCH_TO_RETAILER") {
        return { ...spec, counterparty: chainProduct.authorizedRetailer, custodian: chainProduct.currentCustodian };
    }
    if (action === "RECEIVE_BY_RETAILER") {
        return { ...spec, counterparty: chainProduct.authorizedDistributor, custodian: chainProduct.authorizedRetailer };
    }
    return { ...spec, counterparty: zero, custodian: chainProduct.authorizedRetailer };
};

const reconcileBlockLifecycle = async ({ event, transactionHash, productCode, registryAddress, chainProduct }, deps) => {
    if (typeof deps.blockchainV2.getLifecycleEventsInBlock !== "function") {
        throw fail("Transaction-specific lifecycle logs are unavailable", 503);
    }
    const blockEvents = await deps.blockchainV2.getLifecycleEventsInBlock(
        productCode,
        event.blockNumber,
        registryAddress
    );
    const normalizedHash = String(transactionHash).toLowerCase();
    const target = blockEvents.find((candidate) =>
        Number(candidate.logIndex) === Number(event.logIndex) &&
        String(candidate.transactionHash || "").toLowerCase() === normalizedHash
    );
    if (!target || target.newState !== event.newState || target.previousState !== event.previousState) {
        throw fail("The receipt transition could not be matched to its transaction-specific block log", 409);
    }

    let state = target.newState;
    let custodian = target.custodian;
    const laterEvents = blockEvents
        .filter((candidate) => Number(candidate.logIndex) > Number(target.logIndex))
        .sort((left, right) => Number(left.logIndex) - Number(right.logIndex));
    const zero = ethers.ZeroAddress;
    const nextTransitions = {
        "0:1": { actor: chainProduct.manufacturer, counterparty: chainProduct.authorizedDistributor, custodian: chainProduct.manufacturer },
        "1:2": { actor: chainProduct.authorizedDistributor, counterparty: chainProduct.manufacturer, custodian: chainProduct.authorizedDistributor },
        "2:3": { actor: chainProduct.authorizedDistributor, counterparty: chainProduct.authorizedRetailer, custodian: chainProduct.authorizedDistributor },
        "3:4": { actor: chainProduct.authorizedRetailer, counterparty: chainProduct.authorizedDistributor, custodian: chainProduct.authorizedRetailer },
        "4:5": { actor: chainProduct.authorizedRetailer, counterparty: zero, custodian: chainProduct.authorizedRetailer }
    };

    for (const later of laterEvents) {
        if (later.previousState !== state || !Number.isInteger(later.logIndex) || later.timestamp <= 0) {
            throw fail("A later same-block lifecycle event is out of sequence", 409);
        }
        let expected = nextTransitions[`${later.previousState}:${later.newState}`];
        if (later.newState === 6 && later.previousState >= 0 && later.previousState <= 5) {
            const getAdminAddress = deps.blockchainV2.getAdminAddress;
            if (typeof getAdminAddress !== "function") {
                throw fail("Contract admin identity is unavailable for same-block flag reconciliation", 503);
            }
            expected = {
                actor: await getAdminAddress(registryAddress),
                counterparty: zero,
                custodian
            };
        }
        if (!expected || !addrEq(later.actor, expected.actor) ||
            !addrEq(later.counterparty, expected.counterparty) || !addrEq(later.custodian, expected.custodian)) {
            throw fail("A later same-block lifecycle event does not match an authorized transition", 409);
        }
        state = later.newState;
        custodian = later.custodian;
    }

    if (chainProduct.state !== state || !addrEq(chainProduct.currentCustodian, custodian)) {
        throw fail("On-chain block-end state does not reconcile with the transaction-ordered lifecycle events", 409);
    }
    return { state, custodian };
};

const matchesPreparedTransaction = (transaction, expectedTx, actorWallet, transactionHash, chainId) =>
    Number(transaction.chainId) === Number(chainId) &&
    Number(transaction.chainId) === Number(expectedTx.chainId) &&
    addrEq(transaction.hash, transactionHash) &&
    addrEq(transaction.from, actorWallet) &&
    addrEq(transaction.to, expectedTx.to) &&
    ethers.toQuantity(transaction.value) === ethers.toQuantity(expectedTx.value) &&
    String(transaction.data).toLowerCase() === String(expectedTx.data).toLowerCase();

const assertActorAndProduct = (actor, role, product, chainProduct, action) => {
    validateProductIdentity(product, chainProduct);
    const expected = expectedTransition(action, chainProduct);
    if (expected.role !== role) throw fail("Account role cannot perform this product transition", 403);
    const expectedActor = role === "MANUFACTURER"
        ? chainProduct.manufacturer
        : role === "DISTRIBUTOR"
            ? chainProduct.authorizedDistributor
            : chainProduct.authorizedRetailer;
    if (!addrEq(actor.walletAddress, expectedActor)) {
        throw fail("Bound wallet is not the assigned participant for this product", 403);
    }
    if (role === "MANUFACTURER" && String(actor.profile._id) !== String(product.manufacturerId)) {
        throw fail("Manufacturer profile does not own this product", 403);
    }
    return expected;
};

const publicOperation = (op, extra = {}) => ({
    operationId: op.operationId,
    productCode: op.productCode,
    action: op.action,
    status: op.status,
    previousState: op.previousState,
    newState: op.newState,
    actorWallet: op.actorWallet,
    counterparty: op.counterparty,
    custodian: op.custodian,
    registryVersion: op.registryVersion,
    submissionProtocolVersion: op.submissionProtocolVersion || null,
    registryAddress: op.registryAddress,
    chainId: op.chainId,
    transaction: op.preparedTransaction,
    transactionHash: op.transactionHash || null,
    expiresAt: op.expiresAt || null,
    submissionAttemptId: op.submissionAttemptId || null,
    submissionStartedAt: op.submissionStartedAt || null,
    failureCode: op.failureCode || null,
    reviewReason: op.reviewReason || null,
    reviewRequiredAt: op.reviewRequiredAt || null,
    failedAt: op.failedAt || null,
    ...extra
});

const prepareLifecycleAction = async ({ userId, role, productCode, action }, overrides = {}) => {
    const deps = createDependencies(overrides);
    if (!LIFECYCLE[action]) throw fail("Unsupported lifecycle action");
    if (LIFECYCLE[action].role !== role) throw fail("Account role cannot perform this lifecycle action", 403);
    const actor = await getActorContext(userId, role, deps);
    const product = await findAssignedProduct(productCode, actor, role, deps);
    if (!product) throw fail("Assigned ProductRegistry V2 product was not found", 404);
    if (!product.registryAddress || !addrEq(product.registryAddress, deps.blockchainV2.CONTRACT_ADDRESS)) {
        throw fail("ProductRegistry V2 address is not configured for this product", 503);
    }
    const chainProduct = await deps.blockchainV2.getProduct(productCode, { registryAddress: product.registryAddress });
    const expected = assertActorAndProduct(actor, role, product, chainProduct, action);
    const data = deps.blockchainV2.encodeLifecycleTransaction(action, productCode);
    const transaction = {
        to: product.registryAddress,
        data,
        value: "0x0",
        chainId: Number(deps.blockchainV2.SEPOLIA_CHAIN_ID)
    };
    const activeProductKey = `2:${product.registryAddress.toLowerCase()}:${productCode}`;
    const now = new Date();
    const existingQuery = deps.ProductLifecycleOperation.findOne({ activeProductKey });
    let existing = await (existingQuery?.lean ? existingQuery.lean() : existingQuery);
    const newOperationId = crypto.randomUUID();
    const record = {
        operationId: newOperationId,
        activeProductKey,
        productId: product._id,
        productCode,
        userId,
        actorRole: role,
        actorWallet: actor.walletAddress,
        action,
        previousState: expected.from,
        newState: expected.to,
        counterparty: expected.counterparty,
        custodian: expected.custodian,
        registryVersion: 2,
        registryAddress: product.registryAddress,
        chainId: transaction.chainId,
        submissionProtocolVersion: 2,
        submissionAttemptId: null,
        submissionStartedAt: null,
        preparedTransaction: transaction,
        status: "PREPARED",
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000)
    };

    if (existing && existing.status === "PREPARED" && existing.submissionProtocolVersion === 2 &&
        !existing.transactionHash && !existing.submissionAttemptId && new Date(existing.expiresAt) <= now) {
        const updated = await deps.ProductLifecycleOperation.findOneAndUpdate(
            { operationId: existing.operationId, status: "PREPARED", submissionProtocolVersion: 2, transactionHash: { $exists: false }, submissionAttemptId: null, expiresAt: { $lte: now } },
            { $set: record },
            { new: true }
        );
        if (updated) return publicOperation(plain(updated));
        const refreshed = deps.ProductLifecycleOperation.findOne({ activeProductKey });
        existing = await (refreshed?.lean ? refreshed.lean() : refreshed);
    }

    if (existing) {
        if (existing.status === "PREPARED" && existing.userId.toString() === String(userId) && existing.action === action) {
            return publicOperation(existing, { reused: true });
        }
        throw fail("Another lifecycle action is already pending for this product", 409);
    }

    try {
        const saved = await deps.ProductLifecycleOperation.create(record);
        return publicOperation(plain(saved));
    } catch (error) {
        if (error.code !== 11000) throw error;
        const query = deps.ProductLifecycleOperation.findOne({ activeProductKey });
        const duplicate = await (query?.lean ? query.lean() : query);
        if (duplicate?.status === "PREPARED" && duplicate.userId.toString() === String(userId) && duplicate.action === action) {
            return publicOperation(duplicate, { reused: true });
        }
        throw fail("A concurrent lifecycle action is already pending", 409);
    }
};

const claimLifecycleSubmission = async ({ userId, role, operationId, submissionAttemptId }, overrides = {}) => {
    const deps = createDependencies(overrides);
    if (typeof submissionAttemptId !== "string" || !/^[a-z\d_-]{16,64}$/i.test(submissionAttemptId)) {
        throw fail("Submission attempt identifier is invalid", 400);
    }
    const load = async () => {
        const query = deps.ProductLifecycleOperation.findOne({ operationId, userId });
        return plain(await (query?.lean ? query.lean() : query));
    };
    let operation = await load();
    if (!operation) throw fail("Lifecycle operation was not found for this account", 404);
    if (operation.actorRole !== role) throw fail("Account role cannot claim this lifecycle action", 403);
    if (operation.status === "SUBMITTING" && operation.submissionAttemptId === submissionAttemptId) {
        return publicOperation(operation, { idempotent: true });
    }
    if (operation.status !== "PREPARED" || operation.submissionProtocolVersion !== 2 || operation.transactionHash || new Date(operation.expiresAt) <= new Date()) {
        throw fail("Lifecycle operation is already claimed, expired, or no longer available", 409);
    }
    const actor = await getActorContext(userId, role, deps);
    if (!addrEq(actor.walletAddress, operation.actorWallet)) {
        throw fail("Bound wallet no longer matches the prepared lifecycle operation", 409);
    }
    const claimed = await deps.ProductLifecycleOperation.findOneAndUpdate(
        { operationId, userId, status: "PREPARED", submissionProtocolVersion: 2, transactionHash: { $exists: false }, expiresAt: { $gt: new Date() } },
        { $set: { status: "SUBMITTING", submissionAttemptId, submissionStartedAt: new Date() },
            $unset: { lastReleasedSubmissionAttemptId: 1 } },
        { new: true }
    );
    if (claimed) return publicOperation(plain(claimed));
    operation = await load();
    if (operation?.status === "SUBMITTING" && operation.submissionAttemptId === submissionAttemptId) {
        return publicOperation(operation, { idempotent: true });
    }
    throw fail("Another browser session already claimed this lifecycle operation", 409);
};

const releaseLifecycleSubmission = async ({ userId, role, operationId, submissionAttemptId }, overrides = {}) => {
    const deps = createDependencies(overrides);
    if (typeof submissionAttemptId !== "string" || !/^[a-z\d_-]{16,64}$/i.test(submissionAttemptId)) {
        throw fail("Submission attempt identifier is invalid", 400);
    }
    const load = async () => {
        const query = deps.ProductLifecycleOperation.findOne({ operationId, userId });
        return plain(await (query?.lean ? query.lean() : query));
    };
    let operation = await load();
    if (!operation) throw fail("Lifecycle operation was not found for this account", 404);
    if (operation.actorRole !== role) throw fail("Account role cannot release this lifecycle action", 403);
    if (operation.status === "PREPARED" && operation.lastReleasedSubmissionAttemptId === submissionAttemptId) {
        return publicOperation(operation, { idempotent: true });
    }
    const released = await deps.ProductLifecycleOperation.findOneAndUpdate(
        { operationId, userId, status: "SUBMITTING", submissionAttemptId, transactionHash: { $exists: false } },
        { $set: { status: "PREPARED", expiresAt: new Date(Date.now() + 15 * 60 * 1000), lastReleasedSubmissionAttemptId: submissionAttemptId },
            $unset: { submissionAttemptId: 1, submissionStartedAt: 1 } },
        { new: true }
    );
    if (released) return publicOperation(plain(released));
    operation = await load();
    if (operation?.status === "PREPARED" && operation.lastReleasedSubmissionAttemptId === submissionAttemptId) {
        return publicOperation(operation, { idempotent: true });
    }
    throw fail("The submission cannot be released after a transaction hash was recorded", 409);
};

const confirmLifecycleAction = async ({ userId, role, operationId, transactionHash, submissionAttemptId }, overrides = {}) => {
    const deps = createDependencies(overrides);
    if (!/^0x[\da-fA-F]{64}$/.test(String(transactionHash || ""))) throw fail("Transaction hash is invalid");
    const normalizedHash = String(transactionHash).toLowerCase();
    const load = async () => {
        const q = deps.ProductLifecycleOperation.findOne({ operationId, userId });
        return plain(await (q?.lean ? q.lean() : q));
    };
    let operation = await load();
    if (!operation) throw fail("Pending lifecycle operation was not found for this account", 404);
    if (operation.actorRole !== role) throw fail("Account role cannot confirm this lifecycle action", 403);
    if (operation.submissionAttemptId && operation.submissionAttemptId !== submissionAttemptId) {
        throw fail("This lifecycle operation can only be reconciled by its claimed submission attempt", 409);
    }
    const isLegacyRevertRecovery = !operation.submissionAttemptId &&
        operation.status === "REVIEW_REQUIRED" &&
        operation.reviewReason === "LEGACY_REVERTED_CANDIDATE";
    const knownTransactionHashes = operation.observedTransactionHashes || [];
    if (operation.status === "CONFIRMED" && knownTransactionHashes.some((hash) => hash.toLowerCase() === normalizedHash)) {
        return publicOperation(operation, { idempotent: true });
    }
    if (operation.transactionHash && operation.transactionHash.toLowerCase() !== normalizedHash && !isLegacyRevertRecovery) {
        throw fail("This lifecycle operation is already bound to a different transaction", 409);
    }
    if (operation.status === "FAILED" && operation.transactionHash?.toLowerCase() === normalizedHash) {
        return publicOperation(operation, { idempotent: true });
    }
    if (operation.status === "REVIEW_REQUIRED" && operation.transactionHash?.toLowerCase() === normalizedHash) {
        return publicOperation(operation, { idempotent: true });
    }
    if (operation.status === "CONFIRMED" && operation.transactionHash?.toLowerCase() === normalizedHash) {
        return publicOperation(operation, { idempotent: true });
    }
    if (!(["PREPARED", "SUBMITTING"].includes(operation.status) || isLegacyRevertRecovery) ||
        (operation.status === "SUBMITTING" && operation.transactionHash && operation.transactionHash.toLowerCase() !== normalizedHash)) {
        throw fail("Lifecycle operation is not in a confirmable state", 409);
    }

    const actor = await getActorContext(userId, role, deps);
    if (!addrEq(actor.walletAddress, operation.actorWallet)) {
        throw fail("Bound wallet no longer matches the prepared lifecycle operation", 409);
    }
    const productQuery = deps.Product.findById(operation.productId);
    const product = await (productQuery?.lean ? productQuery.lean() : productQuery);
    if (!product || product.productCode !== operation.productCode || product.registryVersion !== 2) {
        throw fail("Prepared V2 product record is unavailable", 409);
    }
    if (!addrEq(product.registryAddress, operation.registryAddress) || !addrEq(operation.registryAddress, deps.blockchainV2.CONTRACT_ADDRESS)) {
        throw fail("Prepared registry identity no longer matches the configured V2 registry", 409);
    }

    // Pin the first submitted hash before any receipt/RPC wait. A competing browser
    // session cannot make a revert win while another hash succeeds.
    if (isLegacyRevertRecovery) {
        const priorHash = operation.transactionHash?.toLowerCase();
        const pinned = await deps.ProductLifecycleOperation.findOneAndUpdate(
            { operationId, userId, status: "REVIEW_REQUIRED", reviewReason: "LEGACY_REVERTED_CANDIDATE", submissionAttemptId: null, transactionHash: operation.transactionHash },
            { $set: { status: "SUBMITTING", transactionHash: normalizedHash, failureCode: null, reviewReason: null, reviewRequiredAt: null, submissionStartedAt: new Date() },
                $addToSet: { observedTransactionHashes: { $each: [priorHash, normalizedHash] } } },
            { new: true }
        );
        if (pinned) operation = plain(pinned);
        else {
            operation = await load();
            if (!operation || operation.status !== "SUBMITTING" || operation.transactionHash?.toLowerCase() !== normalizedHash) {
                throw fail("A different transaction hash is already being reconciled for this operation", 409);
            }
        }
    } else if (!operation.transactionHash) {
        const pinned = await deps.ProductLifecycleOperation.findOneAndUpdate(
            { operationId, userId, status: operation.status, transactionHash: { $exists: false } },
            { $set: { status: "SUBMITTING", transactionHash: normalizedHash, submissionStartedAt: operation.submissionStartedAt || new Date() },
                $addToSet: { observedTransactionHashes: normalizedHash } },
            { new: true }
        );
        if (pinned) operation = plain(pinned);
        else {
            operation = await load();
            if (!operation || operation.status !== "SUBMITTING" || operation.transactionHash?.toLowerCase() !== normalizedHash) {
                throw fail("A different transaction hash is already being reconciled for this operation", 409);
            }
        }
    }

    const markReviewRequired = async (reason) => {
        const updated = await deps.ProductLifecycleOperation.findOneAndUpdate(
            { operationId, userId, status: "SUBMITTING", transactionHash: normalizedHash },
            { $set: { status: "REVIEW_REQUIRED", failureCode: "CONFIRMATION_REJECTED", reviewReason: reason, reviewRequiredAt: new Date() } },
            { new: true }
        );
        if (updated) return publicOperation(plain(updated));
        const latest = await load();
        if (latest?.status === "REVIEW_REQUIRED" && latest.transactionHash?.toLowerCase() === normalizedHash) {
            return publicOperation(latest, { idempotent: true });
        }
        throw fail("Confirmation requires review and could not be recorded", 503);
    };

    const { receipt, transaction } = await deps.blockchainV2.waitForMintTransaction(transactionHash);
    const expectedTx = operation.preparedTransaction;
    if (!matchesPreparedTransaction(transaction, expectedTx, actor.walletAddress, transactionHash, operation.chainId)) {
        return markReviewRequired("TRANSACTION_MISMATCH");
    }

    if (Number(receipt.status) === 0) {
        if (!operation.submissionAttemptId) {
            return markReviewRequired("LEGACY_REVERTED_CANDIDATE");
        }
        const failed = await deps.ProductLifecycleOperation.findOneAndUpdate(
            { operationId, userId, status: "SUBMITTING", transactionHash: normalizedHash },
            {
                $set: { status: "FAILED", failureCode: "TRANSACTION_REVERTED", failedAt: new Date() },
                $unset: { activeProductKey: 1 }
            },
            { new: true }
        );
        if (failed) return publicOperation(plain(failed));
        const latest = await load();
        if (latest?.status === "FAILED" && latest.transactionHash?.toLowerCase() === normalizedHash) {
            return publicOperation(latest, { idempotent: true });
        }
        throw fail("The transaction reverted but its failure record could not be saved. Retry confirmation with the same hash.", 503);
    }
    if (Number(receipt.status) !== 1) {
        throw fail("Transaction receipt status is not final; retry confirmation with the same hash", 503);
    }

    const event = deps.blockchainV2.parseLifecycleEvent(receipt, {
        productCode: operation.productCode,
        contractAddress: operation.registryAddress
    });
    if (!event) return markReviewRequired("EXPECTED_EVENT_MISSING");
    if (!addrEq(event.transactionHash, transactionHash) || Number(event.blockNumber) !== Number(receipt.blockNumber)) {
        return markReviewRequired("EVENT_RECEIPT_MISMATCH");
    }
    if (!event.actor) return markReviewRequired("EVENT_ACTOR_MISSING");
    if (!addrEq(event.actor, actor.walletAddress)) return markReviewRequired("EVENT_ACTOR_MISMATCH");
    if (!addrEq(event.counterparty, operation.counterparty)) return markReviewRequired("EVENT_COUNTERPARTY_MISMATCH");
    if (!addrEq(event.custodian, operation.custodian)) return markReviewRequired("EVENT_CUSTODIAN_MISMATCH");
    if (event.previousState !== operation.previousState || event.newState !== operation.newState || event.timestamp <= 0) {
        return markReviewRequired("EVENT_STATE_MISMATCH");
    }
    if (!Number.isInteger(event.logIndex) || event.logIndex < 0) {
        return markReviewRequired("EVENT_LOG_INDEX_INVALID");
    }

    const chainProduct = await deps.blockchainV2.getProduct(operation.productCode, {
        registryAddress: operation.registryAddress,
        blockTag: receipt.blockNumber
    });
    try {
        validateProductIdentity(product, chainProduct);
        await reconcileBlockLifecycle({ event, transactionHash, productCode: operation.productCode, registryAddress: operation.registryAddress, chainProduct }, deps);
    } catch (error) {
        if (error.statusCode === 409) return markReviewRequired("ON_CHAIN_STATE_OR_LOG_MISMATCH");
        throw error;
    }

    const confirmed = await deps.ProductLifecycleOperation.findOneAndUpdate(
        { operationId, userId, status: "SUBMITTING", transactionHash: normalizedHash },
        { $set: { status: "CONFIRMED", logIndex: event.logIndex, eventTimestamp: new Date(event.timestamp * 1000), blockNumber: Number(receipt.blockNumber) },
            $unset: { activeProductKey: 1 } },
        { new: true }
    );
    if (confirmed) return publicOperation(plain(confirmed));
    const latest = await load();
    if (latest?.status === "CONFIRMED" && latest.transactionHash?.toLowerCase() === normalizedHash) {
        return publicOperation(latest, { idempotent: true });
    }
    throw fail("Chain transition was confirmed, but its database record is pending. Retry with the same transaction hash.", 503);
};

const listAssignedProducts = async ({ userId, role, page = 1, pageSize = 20 }, overrides = {}) => {
    const deps = createDependencies(overrides);
    const actor = await getActorContext(userId, role, deps);
    const filter = role === "MANUFACTURER"
        ? { manufacturerId: actor.profile._id }
        : role === "DISTRIBUTOR"
            ? { authorizedDistributorId: actor.profile._id }
            : { authorizedRetailerId: actor.profile._id };
    const total = await deps.Product.countDocuments(filter);
    const q = deps.Product.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean();
    const products = await q;
    const productCodes = products.map((product) => product.productCode);
    const operationsQuery = deps.ProductLifecycleOperation.find({
        userId,
        productCode: { $in: productCodes },
        status: { $in: ["PREPARED", "SUBMITTING", "FAILED", "REVIEW_REQUIRED"] }
    }).select("operationId productCode action status transactionHash submissionProtocolVersion submissionAttemptId submissionStartedAt expiresAt failureCode reviewReason reviewRequiredAt failedAt createdAt").sort({ createdAt: -1 }).limit(200).lean();
    const operations = await operationsQuery;
    const pendingActions = operations.filter((item) => ["PREPARED", "SUBMITTING"].includes(item.status));
    const failedActions = operations.filter((item) => item.status === "FAILED");
    const reviewRequiredActions = operations.filter((item) => item.status === "REVIEW_REQUIRED");
    const results = await Promise.all(products.map(async (product) => {
        const identity = await resolveProductIdentity(product, deps);
        if (identity.status !== "RESOLVED") {
            return { product, chainStatus: "REGISTRY_UNRESOLVED", lifecycleState: null, currentCustodian: null };
        }
        if (identity.version !== 2) {
            return { product, chainStatus: "LEGACY", lifecycleState: null, currentCustodian: null };
        }
        try {
            const current = await deps.blockchainV2.getProduct(product.productCode, { registryAddress: identity.address });
            return { product, chainStatus: current ? "AVAILABLE" : "NOT_FOUND", lifecycleState: current ? STATE_LABELS[current.state] : null, currentCustodian: current?.currentCustodian || null };
        } catch {
            return { product, chainStatus: "UNAVAILABLE", lifecycleState: null, currentCustodian: null };
        }
    }));
    return { products: results, pendingActions, failedActions, reviewRequiredActions, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
};

const getAdminProductLifecycle = async ({ productCode, page = 1, pageSize = 20 }, overrides = {}) => {
    const deps = createDependencies(overrides);
    const productQuery = deps.Product.findOne({ productCode });
    const product = await (productQuery?.populate
        ? productQuery.populate("manufacturerId", "companyName").lean()
        : productQuery?.lean ? productQuery.lean() : productQuery);
    if (!product) throw fail("Product not found", 404);
    const identity = await resolveProductIdentity(product, deps);
    const resolved = identity.status === "RESOLVED";
    const filter = resolved
        ? { productCode, status: "CONFIRMED", registryAddress: identity.address, registryVersion: identity.version, chainId: identity.chainId }
        : { productCode, status: "__UNRESOLVED_REGISTRY_IDENTITY__" };
    const [eventsTotal, events, verificationTotal, verifications, failuresTotal, failedOperations, reviewRequiredTotal, reviewRequiredOperations] = await Promise.all([
        deps.ProductLifecycleOperation.countDocuments(filter),
        deps.ProductLifecycleOperation.find(filter).sort({ eventTimestamp: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
        deps.Verification.countDocuments({ productCode }),
        deps.Verification.find({ productCode }).select("productCode verificationType status scoringStatus anomalyScore isSuspicious createdAt").sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
        deps.ProductLifecycleOperation.countDocuments({ ...filter, status: "FAILED" }),
        deps.ProductLifecycleOperation.find({ ...filter, status: "FAILED" }).select("action actorRole transactionHash failureCode failedAt createdAt").sort({ failedAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
        deps.ProductLifecycleOperation.countDocuments({ productCode, status: "REVIEW_REQUIRED", ...(resolved ? { registryAddress: identity.address, registryVersion: identity.version, chainId: identity.chainId } : {}) }),
        deps.ProductLifecycleOperation.find({ productCode, status: "REVIEW_REQUIRED", ...(resolved ? { registryAddress: identity.address, registryVersion: identity.version, chainId: identity.chainId } : {}) }).select("action actorRole transactionHash failureCode reviewReason reviewRequiredAt createdAt").sort({ reviewRequiredAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean()
    ]);
    const version = resolved ? identity.version : null;
    let chain = { status: "REGISTRY_UNRESOLVED", state: null, currentCustodian: null };
    if (resolved) {
        try {
            const current = version === 2
                ? await deps.blockchainV2.getProduct(productCode, { registryAddress: identity.address })
                : await deps.blockchainV1.getProductFromBlockchain(productCode, { registryAddress: identity.address });
            chain = { status: current ? "AVAILABLE" : "NOT_FOUND", state: current ? (version === 2 ? STATE_LABELS[current.state] : ["MINTED", "IN_TRANSIT", "RECEIVED_BY_RETAILER", "SOLD", "FLAGGED_COUNTERFEIT"][current.state]) : null, currentCustodian: current?.currentCustodian || current?.currentOwner || null };
        } catch {
            chain = { status: "UNAVAILABLE", state: null, currentCustodian: null };
        }
    }
    return {
        product: { productCode: product.productCode, productName: product.productName, brandName: product.brandName, productHash: product.productHash, manufacturer: product.manufacturerId?.companyName || null },
        registry: resolved
            ? { version, address: identity.address, chainId: identity.chainId, source: identity.source }
            : { version: null, address: null, chainId: null, source: "UNRESOLVED" },
        chain,
        lifecycleHistoryStatus: !resolved
            ? "REGISTRY_IDENTITY_UNRESOLVED"
            : version === 2
            ? "INDEXED_FROM_VERIFIED_BACKEND_CONFIRMATIONS"
            : "NOT_INDEXED_FOR_LEGACY_REGISTRY",
        lifecycle: resolved && version === 2 ? events : [],
        failedOperations,
        reviewRequiredOperations,
        verifications,
        pagination: { page, pageSize, lifecycleTotal: eventsTotal, failureTotal: failuresTotal, reviewRequiredTotal, verificationTotal, totalPages: Math.ceil(Math.max(eventsTotal, failuresTotal, reviewRequiredTotal, verificationTotal) / pageSize) }
    };
};

module.exports = {
    LIFECYCLE,
    STATE_LABELS,
    prepareLifecycleAction,
    claimLifecycleSubmission,
    releaseLifecycleSubmission,
    confirmLifecycleAction,
    listAssignedProducts,
    getAdminProductLifecycle,
    createDependencies
};
