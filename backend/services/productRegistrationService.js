const { ethers } = require("ethers");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const Product = require("../models/Product");
const ProductRegistration = require("../models/ProductRegistration");
const ProductCounter = require("../models/ProductCounter");
const User = require("../models/User");
const Manufacturer = require("../models/Manufacturer");
const SupplyChainPartner = require("../models/SupplyChainPartner");
const Verification = require("../models/Verification");
const blockchain = require("./blockchainService");
const blockchainV2 = require("./blockchainV2Service");

const IPFS_IMAGE_HASH = "";
const FPD0025_DELEGATED_RECOVERY = Object.freeze({
    registrationId: "68c89b2b-ebec-4370-8f54-545016d020f1",
    productCode: "FPD0025",
    batchNumber: "FD0100",
    transactionHash: "0x5062b95ad501f6da9a66f6253d7c1da77446de9d8c9d9d0f200594f08767f905"
});
const ERC7710_INTERFACE = new ethers.Interface([
    "function redeemDelegations(bytes[] _permissionContexts,bytes32[] _modes,bytes[] _executionCallDatas)"
]);
const ERC7710_SINGLE_CALL_MODE = `0x${"00".repeat(32)}`;

const registrationError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const cleanProductInput = (input = {}) => {
    const product = {
        productName: String(input.productName || "").trim(),
        category: String(input.category || "").trim(),
        brandName: String(input.brandName || "").trim(),
        batchNumber: String(input.batchNumber || "").trim(),
        manufacturingDate: input.manufacturingDate,
        price: input.price === undefined || input.price === null || input.price === ""
            ? null
            : Number(input.price),
        description: String(input.description || "").trim()
    };

    if ([product.productName, product.category, product.brandName, product.batchNumber, product.manufacturingDate].some((value) => !value)) {
        throw registrationError("All product fields are required");
    }

    if (product.price !== null && (!Number.isFinite(product.price) || product.price < 0)) {
        throw registrationError("Product price must be a non-negative number");
    }

    const date = new Date(product.manufacturingDate);
    if (Number.isNaN(date.getTime())) {
        throw registrationError("Manufacturing date is invalid");
    }

    product.manufacturingDate = date.toISOString();
    return product;
};

const getManufacturerContext = async (userId, deps, registryVersion = 1) => {
    const user = await deps.User.findById(userId);
    if (!user || user.status !== "ACTIVE" || user.role !== "MANUFACTURER") {
        throw registrationError("An active manufacturer account is required", 403);
    }

    const manufacturer = await deps.Manufacturer.findOne({ userId });
    if (!manufacturer || manufacturer.verificationStatus !== "VERIFIED") {
        throw registrationError("Manufacturer approval is required", 403);
    }

    if (!user.walletAddress || !user.walletVerifiedAt) {
        throw registrationError("Bind and verify your manufacturer wallet before registering products", 403);
    }

    const walletAddress = ethers.getAddress(user.walletAddress);
    const chain = registryVersion === 2 ? deps.blockchainV2 : deps.blockchain;
    const roleReader = chain.getRole || deps.blockchain.getRole;
    const role = await roleReader(walletAddress);
    if (role !== (chain.ROLE || deps.blockchain.ROLE).MANUFACTURER) {
        throw registrationError("The bound wallet does not have the on-chain manufacturer role", 403);
    }

    return { user, manufacturer, walletAddress };
};

const resolveAuthorizedPartner = async (partnerId, type, deps, registryVersion = 1) => {
    if (!partnerId) {
        throw registrationError(`Select an approved ${type.toLowerCase()}`);
    }

    let partner;
    try {
        partner = await deps.SupplyChainPartner.findOne({
            _id: partnerId,
            partnerType: type,
            verificationStatus: "VERIFIED"
        }).populate("userId", "status walletAddress walletVerifiedAt");
    } catch {
        partner = null;
    }

    const partnerUser = partner?.userId;
    if (
        !partner ||
        !partnerUser ||
        partnerUser.status !== "ACTIVE" ||
        !partnerUser.walletAddress ||
        !partnerUser.walletVerifiedAt
    ) {
        throw registrationError(`Select an active, approved ${type.toLowerCase()} with a verified wallet`, 403);
    }

    const walletAddress = ethers.getAddress(partnerUser.walletAddress);
    const chain = registryVersion === 2 ? deps.blockchainV2 : deps.blockchain;
    const expectedRole = type === "DISTRIBUTOR"
        ? (chain.ROLE || deps.blockchain.ROLE).DISTRIBUTOR
        : (chain.ROLE || deps.blockchain.ROLE).RETAILER;
    const role = await (chain.getRole || deps.blockchain.getRole)(walletAddress);

    if (role !== expectedRole) {
        throw registrationError(`Selected ${type.toLowerCase()} wallet is not approved for that role on Sepolia`, 403);
    }

    return { partner, walletAddress };
};

const allocateProductCode = async (deps) => {
    const [existing, registrations] = await Promise.all([
        deps.Product.find({ productCode: /^FPD\d+$/ }).select("productCode").lean(),
        deps.ProductRegistration.find({ productCode: /^FPD\d+$/ }).select("productCode").lean()
    ]);
    const highestExisting = [...(existing || []), ...(registrations || [])].reduce((max, product) => {
        const match = product.productCode.match(/^FPD(\d+)$/);
        return match ? Math.max(max, Number(match[1])) : max;
    }, 0);

    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            try {
                await deps.ProductCounter.updateOne(
                    { _id: "product-code" },
                    { $setOnInsert: { sequence: highestExisting } },
                    { upsert: true }
                );
            } catch (error) {
                if (error.code !== 11000) throw error;
            }

            const counter = await deps.ProductCounter.findOneAndUpdate(
                { _id: "product-code" },
                { $inc: { sequence: 1 } },
                { new: true }
            );

            const productCode = `FPD${String(counter.sequence).padStart(4, "0")}`;
            const [storedProduct, onChainProduct] = await Promise.all([
                deps.Product.findOne({ productCode }).lean(),
                deps.blockchain.getProductFromBlockchain(productCode)
            ]);

            if (!storedProduct && !onChainProduct) {
                return productCode;
            }
        } catch (error) {
            if (error.code === 11000 && attempt < 4) {
                continue;
            }
            throw error;
        }
    }

    throw registrationError("Unable to allocate a unique product code; try again", 503);
};

const createDependencies = (overrides = {}) => ({
    User,
    Manufacturer,
    SupplyChainPartner,
    Product,
    ProductRegistration,
    ProductCounter,
    Verification,
    blockchain,
    blockchainV2: overrides.blockchainV2 || (overrides.blockchain ? overrides.blockchain : blockchainV2),
    loadReferenceImage: async (referenceImagePath) => {
        const uploadsRoot = path.resolve(process.cwd(), "uploads");
        const normalized = String(referenceImagePath || "").replaceAll("\\", "/");
        if (!normalized.startsWith("products/") || normalized.split("/").includes("..")) {
            throw registrationError("Saved reference image path is invalid", 409);
        }

        const fullPath = path.resolve(uploadsRoot, normalized);
        if (!fullPath.startsWith(`${uploadsRoot}${path.sep}`)) {
            throw registrationError("Saved reference image path is invalid", 409);
        }

        try {
            return await fs.readFile(fullPath);
        } catch {
            const error = registrationError("Saved reference image is unavailable; registration was not completed", 409);
            error.code = "REFERENCE_IMAGE_UNAVAILABLE";
            throw error;
        }
    },
    ...overrides
});

const toPlainRegistration = (registration) =>
    registration?.toObject ? registration.toObject() : registration;

const publicRegistration = (registration) => {
    const plain = toPlainRegistration(registration);
    return {
        registrationId: plain.registrationId,
        status: plain.status,
        productCode: plain.productCode,
        productHash: plain.productHash,
        transaction: plain.preparedTransaction,
        registryVersion: plain.registryVersion || plain.preparedTransaction.registryVersion || null,
        transactionHash: plain.transactionHash || null,
        product: plain.product,
        distributorId: String(plain.distributorId),
        distributorWallet: plain.distributorWallet,
        retailerId: String(plain.retailerId),
        retailerWallet: plain.retailerWallet
    };
};

const resolveSavedRegistrationVersion = (registration, deps) => {
    const explicitVersion = Number(registration.registryVersion || registration.preparedTransaction?.registryVersion || 0);
    if ([1, 2].includes(explicitVersion)) return explicitVersion;
    const destination = String(registration.preparedTransaction?.to || "").toLowerCase();
    const chainId = Number(registration.preparedTransaction?.chainId || 0);
    const candidates = [deps.blockchain, deps.blockchainV2].filter((chain, index) =>
        chain?.CONTRACT_ADDRESS &&
        chain.CONTRACT_ADDRESS.toLowerCase() === destination &&
        Number(chain.SEPOLIA_CHAIN_ID) === chainId
    ).map((chain) => Number(chain.REGISTRY_VERSION || (chain === deps.blockchainV2 ? 2 : 1)));
    if (candidates.length === 1) return candidates[0];
    throw registrationError("Saved registration registry identity is missing or ambiguous", 409);
};

const preparedRegistrationResult = (registration) => ({
    ...publicRegistration(registration),
    referenceImagePath: toPlainRegistration(registration).referenceImagePath
});

const getPreparedMintCall = (transaction, preparedTransaction, { allowERC7710 = false } = {}) => {
    const sameAddress = (left, right) =>
        typeof left === "string" && typeof right === "string" &&
        left.toLowerCase() === right.toLowerCase();
    const sameValue = (left, right) => {
        try {
            return ethers.toQuantity(left) === ethers.toQuantity(right);
        } catch {
            return false;
        }
    };

    if (
        sameAddress(transaction.to, preparedTransaction.to) &&
        String(transaction.data).toLowerCase() === preparedTransaction.data.toLowerCase() &&
        sameValue(transaction.value, preparedTransaction.value)
    ) {
        return { data: transaction.data, value: transaction.value };
    }

    // Accept only the observed ERC-7710 envelope: one permission context,
    // one default single-call mode, and one packed target/value/calldata tuple.
    if (
        !allowERC7710 ||
        !transaction.to ||
        sameAddress(transaction.to, preparedTransaction.to)
    ) return null;

    let decoded;
    try {
        decoded = ERC7710_INTERFACE.parseTransaction({
            data: transaction.data,
            value: transaction.value
        });
    } catch {
        return null;
    }
    if (!decoded || decoded.name !== "redeemDelegations") return null;

    const permissionContexts = Array.from(decoded.args[0] || []);
    const modes = Array.from(decoded.args[1] || []);
    const executionCallDatas = Array.from(decoded.args[2] || []);
    if (
        permissionContexts.length !== 1 ||
        !permissionContexts[0] || permissionContexts[0] === "0x" ||
        modes.length !== 1 || modes[0] !== ERC7710_SINGLE_CALL_MODE ||
        executionCallDatas.length !== 1
    ) {
        return null;
    }

    const packedExecution = executionCallDatas[0];
    if (typeof packedExecution !== "string" || !/^0x[\da-fA-F]+$/.test(packedExecution)) return null;
    const packed = packedExecution.slice(2);
    // ERC-7579 single-call encoding is address (20 bytes), value (32 bytes), calldata.
    if (packed.length < (20 + 32 + 4) * 2) return null;

    const target = `0x${packed.slice(0, 40)}`;
    const valueHex = `0x${packed.slice(40, 104)}`;
    const data = `0x${packed.slice(104)}`;
    let normalizedTarget;
    let value;
    try {
        normalizedTarget = ethers.getAddress(target);
        value = BigInt(valueHex);
    } catch {
        return null;
    }

    if (
        !sameAddress(normalizedTarget, preparedTransaction.to) ||
        !sameValue(value, preparedTransaction.value) ||
        data.toLowerCase() !== preparedTransaction.data.toLowerCase() ||
        !sameValue(transaction.value, preparedTransaction.value)
    ) {
        return null;
    }

    return { data, value };
};

const createRequestFingerprint = (values) => crypto.createHash("sha256")
    .update(JSON.stringify({
        manufacturerUserId: String(values.manufacturerUserId),
        manufacturerId: String(values.manufacturerId),
        product: values.product,
        distributorId: String(values.distributorId),
        distributorWallet: values.distributorWallet.toLowerCase(),
        retailerId: String(values.retailerId),
        retailerWallet: values.retailerWallet.toLowerCase(),
        referenceImageHash: values.referenceImageHash
    }))
    .digest("hex");

const sameRequestData = (existing, expected) =>
    existing.referenceImageHash === expected.referenceImageHash &&
    String(existing.manufacturerId) === String(expected.manufacturerId) &&
    String(existing.distributorId) === String(expected.distributorId) &&
    String(existing.retailerId) === String(expected.retailerId) &&
    existing.manufacturerWallet.toLowerCase() === expected.manufacturerWallet.toLowerCase() &&
    existing.distributorWallet.toLowerCase() === expected.distributorWallet.toLowerCase() &&
    existing.retailerWallet.toLowerCase() === expected.retailerWallet.toLowerCase() &&
    JSON.stringify(existing.product) === JSON.stringify(expected.product);

const prepareProductRegistration = async ({
    userId,
    input,
    distributorId,
    retailerId,
    idempotencyKey,
    referenceImagePath
}, overrides = {}) => {
    const deps = createDependencies(overrides);
    const product = cleanProductInput(input);
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(String(idempotencyKey || ""))) {
        throw registrationError("A valid registration idempotency key is required");
    }
    if (!referenceImagePath) {
        throw registrationError("Reference image is required");
    }

    const { manufacturer, walletAddress } = await getManufacturerContext(userId, deps, 2);
    const [distributor, retailer] = await Promise.all([
        resolveAuthorizedPartner(distributorId, "DISTRIBUTOR", deps, 2),
        resolveAuthorizedPartner(retailerId, "RETAILER", deps, 2)
    ]);

    const imageBuffer = await deps.loadReferenceImage(referenceImagePath);
    const referenceImageHash = deps.blockchain.createImageHash(imageBuffer);
    const manufacturerId = String(manufacturer._id);
    const existing = await deps.ProductRegistration.findOne({
        manufacturerUserId: userId,
        idempotencyKey
    });
    if (existing) {
        const record = toPlainRegistration(existing);
        const expectedHash = deps.blockchain.createProductHash({
            productCode: record.productCode,
            manufacturerId,
            ...product
        });
        const expected = {
            productHash: expectedHash,
            referenceImageHash,
            manufacturerId,
            manufacturerWallet: walletAddress,
            distributorId: String(distributor.partner._id),
            distributorWallet: distributor.walletAddress,
            retailerId: String(retailer.partner._id),
            retailerWallet: retailer.walletAddress,
            product
        };
        if (!sameRequestData(record, expected)) {
            throw registrationError("This idempotency key is already associated with different registration data", 409);
        }
        if (record.referenceImagePath !== referenceImagePath) {
            const savedImage = await deps.loadReferenceImage(record.referenceImagePath);
            if (deps.blockchain.createImageHash(savedImage) !== record.referenceImageHash) {
                throw registrationError("Saved reference image is missing or has changed", 409);
            }
        }
        return preparedRegistrationResult(record);
    }

    const productCode = await allocateProductCode(deps);
    const canonicalProductHash = deps.blockchain.createProductHash({
        productCode,
        manufacturerId,
        ...product
    });

    const mintChain = deps.blockchainV2 || deps.blockchain;
    const transaction = await mintChain.prepareMintTransaction({
        productCode,
        manufacturerId,
        productHash: canonicalProductHash,
        authorizedDistributor: distributor.walletAddress,
        authorizedRetailer: retailer.walletAddress
    });

    const registryVersion = Number(transaction.registryVersion || mintChain.REGISTRY_VERSION || 1);
    if (
        Number(transaction.chainId) !== deps.blockchain.SEPOLIA_CHAIN_ID ||
        !transaction.to ||
        !mintChain.CONTRACT_ADDRESS ||
        transaction.to.toLowerCase() !== mintChain.CONTRACT_ADDRESS.toLowerCase()
    ) {
        throw registrationError("Prepared transaction does not target the configured Sepolia ProductRegistry", 503);
    }

    const registrationData = {
        registrationId: crypto.randomUUID(),
        idempotencyKey,
        manufacturerUserId: userId,
        manufacturerId: manufacturer._id,
        productCode,
        product,
        manufacturerWallet: walletAddress,
        distributorId: distributor.partner._id,
        distributorWallet: distributor.walletAddress,
        retailerId: retailer.partner._id,
        retailerWallet: retailer.walletAddress,
        productHash: canonicalProductHash,
        referenceImageHash,
        referenceImagePath,
        activeRequestKey: createRequestFingerprint({
            manufacturerUserId: userId,
            manufacturerId: manufacturer._id,
            product,
            distributorId: distributor.partner._id,
            distributorWallet: distributor.walletAddress,
            retailerId: retailer.partner._id,
            retailerWallet: retailer.walletAddress,
            referenceImageHash
        }),
        ipfsImageHash: IPFS_IMAGE_HASH,
        preparedTransaction: {
            to: transaction.to,
            data: transaction.data,
            value: String(transaction.value),
            chainId: Number(transaction.chainId),
            registryVersion
        },
        registryVersion,
        status: "PREPARED"
    };

    let savedRegistration;
    try {
        savedRegistration = await deps.ProductRegistration.create(registrationData);
    } catch (error) {
        if (error.code === 11000) {
            const duplicate = await deps.ProductRegistration.findOne({
                manufacturerUserId: userId,
                $or: [
                    { idempotencyKey },
                    { activeRequestKey: registrationData.activeRequestKey }
                ]
            });
            if (duplicate) {
                const record = toPlainRegistration(duplicate);
                if (
                    record.idempotencyKey === idempotencyKey &&
                    !sameRequestData(record, registrationData)
                ) {
                    throw registrationError("This idempotency key is already associated with different registration data", 409);
                }
                if (sameRequestData(record, registrationData)) return preparedRegistrationResult(record);
            }
        }
        throw error;
    }

    return preparedRegistrationResult(savedRegistration);
};

const confirmProductRegistration = async ({
    userId,
    registrationId,
    transactionHash,
    qrCode
}, overrides = {}) => {
    const deps = createDependencies(overrides);
    if (typeof registrationId !== "string" || !registrationId) {
        throw registrationError("Registration identifier is required");
    }
    if (!/^0x[\da-fA-F]{64}$/.test(String(transactionHash || ""))) {
        throw registrationError("Transaction hash is invalid");
    }

    const loadOwnedRegistration = () => deps.ProductRegistration.findOne({
        registrationId,
        manufacturerUserId: userId
    });
    let registration = await loadOwnedRegistration();
    if (!registration) throw registrationError("Pending registration was not found for this manufacturer", 404);
    registration = toPlainRegistration(registration);
    const registryVersion = resolveSavedRegistrationVersion(registration, deps);
    const chain = registryVersion === 2 ? deps.blockchainV2 : deps.blockchain;

    if (registration.transactionHash && registration.transactionHash !== transactionHash) {
        throw registrationError("This registration is already associated with a different transaction", 409);
    }
    if (!["MINT_SUBMITTING", "MINT_CONFIRMED", "COMPLETE"].includes(registration.status)) {
        throw registrationError("Registration is not in a confirmable state", 409);
    }

    const { manufacturer, walletAddress } = await getManufacturerContext(userId, deps, registryVersion);
    if (
        String(manufacturer._id) !== String(registration.manufacturerId) ||
        walletAddress.toLowerCase() !== registration.manufacturerWallet.toLowerCase()
    ) {
        throw registrationError("Manufacturer identity or wallet no longer matches the saved registration", 409);
    }

    const [distributor, retailer] = await Promise.all([
        resolveAuthorizedPartner(registration.distributorId, "DISTRIBUTOR", deps, registryVersion),
        resolveAuthorizedPartner(registration.retailerId, "RETAILER", deps, registryVersion)
    ]);
    if (
        distributor.walletAddress.toLowerCase() !== registration.distributorWallet.toLowerCase() ||
        retailer.walletAddress.toLowerCase() !== registration.retailerWallet.toLowerCase()
    ) {
        throw registrationError("Selected partner wallets no longer match the saved registration", 409);
    }

    const product = cleanProductInput(registration.product);
    const productCode = registration.productCode;
    const manufacturerId = String(registration.manufacturerId);
    const productHash = deps.blockchain.createProductHash({
        productCode,
        manufacturerId,
        ...product
    });
    if (productHash !== registration.productHash) {
        throw registrationError("Saved product data does not match its prepared product hash", 409);
    }

    let imageBuffer;
    try {
        imageBuffer = await deps.loadReferenceImage(registration.referenceImagePath);
    } catch (error) {
        if (error.code === "REFERENCE_IMAGE_UNAVAILABLE") throw error;
        throw registrationError("Saved reference image is missing or unavailable", 409);
    }
    const imageHash = deps.blockchain.createImageHash(imageBuffer);
    if (!registration.referenceImageHash || imageHash !== registration.referenceImageHash) {
        throw registrationError("Saved reference image does not match its prepared hash", 409);
    }

    let confirmed;
    try {
        confirmed = await chain.waitForMintTransaction(transactionHash);
    } catch (error) {
        const pendingError = new Error(
            "Transaction confirmation is not available yet. Retry with the same transaction hash."
        );
        pendingError.code = "TRANSACTION_CONFIRMATION_PENDING";
        pendingError.cause = error;
        throw pendingError;
    }
    const { receipt, transaction } = confirmed;
    if (Number(receipt.status) !== 1) {
        throw registrationError("Sepolia rejected the product registration transaction", 409);
    }

    const preparedTransaction = registration.preparedTransaction;
    if (
        Number(transaction.chainId) !== chain.SEPOLIA_CHAIN_ID ||
        Number(transaction.chainId) !== Number(preparedTransaction.chainId) ||
        !transaction.from ||
        transaction.from.toLowerCase() !== walletAddress.toLowerCase() ||
        ethers.toQuantity(transaction.value) !== ethers.toQuantity(preparedTransaction.value)
    ) {
        throw registrationError("Transaction sender, network, or value does not match this registration", 400);
    }

    const allowKnownDelegatedRecovery =
        registration.registrationId === FPD0025_DELEGATED_RECOVERY.registrationId &&
        registration.productCode === FPD0025_DELEGATED_RECOVERY.productCode &&
        product.batchNumber === FPD0025_DELEGATED_RECOVERY.batchNumber &&
        transactionHash === FPD0025_DELEGATED_RECOVERY.transactionHash;
    const mintCall = getPreparedMintCall(
        transaction,
        preparedTransaction,
        { allowERC7710: allowKnownDelegatedRecovery }
    );
    if (!mintCall) {
        throw registrationError("Transaction does not contain the exact prepared direct or delegated mint call", 400);
    }

    const contractInterface = chain.contractInterface || deps.blockchain.contractInterface;
    const parsed = contractInterface.parseTransaction(mintCall);
    if (!parsed || parsed.name !== "mintProduct") {
        throw registrationError("Confirmed transaction did not call mintProduct", 400);
    }

    const args = parsed.args;
    const expected = [
        productCode,
        manufacturerId,
        productHash,
        IPFS_IMAGE_HASH,
        distributor.walletAddress,
        retailer.walletAddress
    ];
    const received = Array.from(args);
    const addressMatches = (left, right) =>
        String(left).toLowerCase() === String(right).toLowerCase();
    if (
        received[0] !== expected[0] ||
        received[1] !== expected[1] ||
        received[2] !== expected[2] ||
        received[3] !== expected[3] ||
        !addressMatches(received[4], expected[4]) ||
        !addressMatches(received[5], expected[5])
    ) {
        throw registrationError("Confirmed transaction data does not match the submitted product", 400);
    }

    const event = chain.getMintEvent
        ? chain.getMintEvent(receipt, productCode)
        : deps.blockchain.getMintEvent(receipt, productCode);
    if (
        !event ||
        event.productId !== productCode ||
        event.manufacturerId !== manufacturerId ||
        event.productHash !== productHash ||
        event.ipfsImageHash !== IPFS_IMAGE_HASH
    ) {
        throw registrationError("Confirmed receipt does not contain the expected ProductMinted event", 409);
    }

    const chainProduct = chain.getProductFromBlockchain
        ? await chain.getProductFromBlockchain(productCode)
        : await chain.getProduct(productCode);
    if (
        !chainProduct ||
        chainProduct.productId !== productCode ||
        chainProduct.productHash !== productHash ||
        chainProduct.ipfsImageHash !== registration.ipfsImageHash ||
        chainProduct.manufacturerId !== manufacturerId ||
        !addressMatches(chainProduct.authorizedDistributor, distributor.walletAddress) ||
        !addressMatches(chainProduct.authorizedRetailer, retailer.walletAddress)
    ) {
        throw registrationError("The on-chain product record does not match the confirmed registration", 409);
    }

    const existingProduct = await deps.Product.findOne({
        $or: [{ productCode }, { transactionHash }]
    }).lean();
    if (existingProduct) {
        const retryMatches =
            existingProduct.productCode === productCode &&
            existingProduct.transactionHash === transactionHash &&
            existingProduct.productHash === productHash &&
            String(existingProduct.manufacturerId) === manufacturerId &&
            existingProduct.imageHash === imageHash &&
            String(existingProduct.authorizedDistributorId) === String(registration.distributorId) &&
            String(existingProduct.authorizedRetailerId) === String(registration.retailerId);
        if (!retryMatches) {
            throw registrationError("This product code has already been registered", 409);
        }
    }

    if (registration.status === "MINT_SUBMITTING") {
        const confirmedRegistration = await deps.ProductRegistration.findOneAndUpdate(
            {
                registrationId,
                manufacturerUserId: userId,
                status: "MINT_SUBMITTING",
                transactionHash: { $exists: false }
            },
            {
                $set: {
                    status: "MINT_CONFIRMED",
                    transactionHash,
                    mintedAt: new Date(chainProduct.mintedAt * 1000)
                }
            },
            { new: true }
        );
        if (!confirmedRegistration) {
            const latest = toPlainRegistration(await loadOwnedRegistration());
            if (
                !latest ||
                !["MINT_CONFIRMED", "COMPLETE"].includes(latest.status) ||
                latest.transactionHash !== transactionHash
            ) {
                throw registrationError("Registration was updated concurrently; retry with its saved transaction", 409);
            }
            registration.status = latest.status;
            registration.transactionHash = latest.transactionHash;
        } else {
            registration.status = "MINT_CONFIRMED";
            registration.transactionHash = transactionHash;
        }
    }

    let saved = existingProduct;
    if (!saved) {
        try {
            saved = await deps.Product.create({
                ...product,
                productCode,
                manufacturerId: manufacturer._id,
                manufacturerWallet: walletAddress,
                authorizedDistributor: distributor.walletAddress,
                authorizedDistributorId: distributor.partner._id,
                authorizedRetailer: retailer.walletAddress,
                authorizedRetailerId: retailer.partner._id,
                productHash,
                imageHash,
                ipfsImageHash: registration.ipfsImageHash,
                transactionHash,
                registryVersion,
                registryAddress: registration.preparedTransaction.to,
                chainId: Number(registration.preparedTransaction.chainId),
                mintedAt: new Date(chainProduct.mintedAt * 1000),
                referenceImage: registration.referenceImagePath,
                qrCode: ""
            });
        } catch (error) {
            if (error.code === 11000) {
                const duplicate = await deps.Product.findOne({
                    $or: [{ productCode }, { transactionHash }]
                }).lean();
                if (
                    duplicate?.productCode === productCode &&
                    duplicate.transactionHash === transactionHash &&
                    duplicate.productHash === productHash &&
                    duplicate.imageHash === imageHash
                ) {
                    saved = duplicate;
                }
            }
            if (!saved) {
                const persistenceError = new Error(
                    "Blockchain registration is confirmed, but MongoDB could not save the product. Retry with the same registration and transaction."
                );
                persistenceError.code = "PRODUCT_PERSISTENCE_AFTER_MINT";
                persistenceError.transactionHash = transactionHash;
                persistenceError.cause = error;
                throw persistenceError;
            }
        }
    }

    if (!saved.qrCode && saved.save) {
        try {
            saved.qrCode = await qrCode({
                productCode: saved.productCode,
                productName: saved.productName,
                brandName: saved.brandName,
                category: saved.category,
                productHash: saved.productHash
            });
            await saved.save();
        } catch {
            // Product persistence is complete even if QR rendering needs a retry.
        }
    }

    const completed = await deps.ProductRegistration.findOneAndUpdate(
        {
            registrationId,
            manufacturerUserId: userId,
            status: "MINT_CONFIRMED",
            transactionHash
        },
            {
                $set: { status: "COMPLETE", completedAt: new Date() },
                $unset: { activeRequestKey: 1 }
            },
        { new: true }
    );
    if (!completed) {
        const latest = toPlainRegistration(await loadOwnedRegistration());
        if (latest?.status !== "COMPLETE" || latest.transactionHash !== transactionHash) {
            const completionError = registrationError("Product was saved, but registration completion could not be recorded. Retry safely.", 503);
            completionError.code = "REGISTRATION_COMPLETION_PENDING";
            throw completionError;
        }
    }

    return saved;
};

const listPendingProductRegistrations = async (userId, overrides = {}) => {
    const deps = createDependencies(overrides);
    const registrations = await deps.ProductRegistration.find({
        manufacturerUserId: userId,
        status: { $in: ["PREPARED", "MINT_SUBMITTING", "MINT_CONFIRMED"] }
    }).sort({ createdAt: -1 }).lean();
    return registrations.map(publicRegistration);
};

const claimProductRegistrationMint = async ({ userId, registrationId }, overrides = {}) => {
    const deps = createDependencies(overrides);
    const prepared = toPlainRegistration(await deps.ProductRegistration.findOne({
        registrationId,
        manufacturerUserId: userId,
        status: "PREPARED"
    }));
    if (!prepared) {
        throw registrationError("Registration is unavailable for mint submission; do not submit another transaction", 409);
    }

    let imageBuffer;
    try {
        imageBuffer = await deps.loadReferenceImage(prepared.referenceImagePath);
    } catch {
        throw registrationError("Saved reference image is unavailable; mint was not submitted", 409);
    }
    if (deps.blockchain.createImageHash(imageBuffer) !== prepared.referenceImageHash) {
        throw registrationError("Saved reference image does not match its prepared hash; mint was not submitted", 409);
    }

    const registration = await deps.ProductRegistration.findOneAndUpdate(
        {
            registrationId,
            manufacturerUserId: userId,
            status: "PREPARED",
            referenceImageHash: prepared.referenceImageHash
        },
        { $set: { status: "MINT_SUBMITTING" } },
        { new: true }
    );
    if (!registration) {
        throw registrationError("Registration is unavailable for mint submission; do not submit another transaction", 409);
    }
    return publicRegistration(registration);
};

const getApprovedPartners = async (type, overrides = {}) => {
    const deps = createDependencies(overrides);
    if (!["DISTRIBUTOR", "RETAILER"].includes(type)) {
        throw registrationError("Partner type must be DISTRIBUTOR or RETAILER");
    }

    const partners = await deps.SupplyChainPartner.find({
        partnerType: type,
        verificationStatus: "VERIFIED"
    }).populate("userId", "name status walletAddress walletVerifiedAt").sort({ companyName: 1 });

    const eligible = [];
    for (const partner of partners) {
        const user = partner.userId;
        if (
            user?.status !== "ACTIVE" ||
            !user.walletAddress ||
            !user.walletVerifiedAt
        ) {
            continue;
        }

        const partnerChain = deps.blockchainV2 || deps.blockchain;
        const role = await (partnerChain.getRole || deps.blockchain.getRole)(user.walletAddress);
        const roleConstants = partnerChain.ROLE || deps.blockchain.ROLE;
        const expectedRole = type === "DISTRIBUTOR"
            ? roleConstants.DISTRIBUTOR
            : roleConstants.RETAILER;
        if (role === expectedRole) {
            eligible.push({
                id: String(partner._id),
                companyName: partner.companyName,
                walletAddress: ethers.getAddress(user.walletAddress)
            });
        }
    }

    return eligible;
};

const addVerificationMetrics = async (products, VerificationModel) => {
    if (!products.length) return [];

    const groups = await VerificationModel.aggregate([
        {
            $match: {
                productCode: { $in: products.map((product) => product.productCode) }
            }
        },
        {
            $group: {
                _id: {
                    productCode: "$productCode",
                    verificationType: "$verificationType",
                    status: "$status",
                    scoringStatus: "$scoringStatus"
                },
                count: { $sum: 1 }
            }
        }
    ]);

    const metricsByProduct = new Map(products.map((product) => [product.productCode, {
        totalVerifications: 0,
        qrScans: 0,
        imageVerifications: 0,
        verificationStatusCounts: {
            GENUINE: 0,
            SUSPICIOUS: 0,
            FAKE: 0,
            NOT_REGISTERED: 0,
            DEACTIVATED: 0,
            FLAGGED: 0,
            INVALID_QR: 0
        },
        scoringStatusCounts: {
            SCORED: 0,
            INSUFFICIENT_DATA: 0,
            UNAVAILABLE: 0
        }
    }]));

    for (const group of groups) {
        const metrics = metricsByProduct.get(group._id.productCode);
        if (!metrics) continue;

        metrics.totalVerifications += group.count;
        if (group._id.verificationType === "QR") metrics.qrScans += group.count;
        if (group._id.verificationType === "IMAGE") metrics.imageVerifications += group.count;

        if (group._id.status) {
            metrics.verificationStatusCounts[group._id.status] =
                (metrics.verificationStatusCounts[group._id.status] || 0) + group.count;
        }

        if (
            group._id.verificationType === "QR" &&
            Object.hasOwn(metrics.scoringStatusCounts, group._id.scoringStatus)
        ) {
            metrics.scoringStatusCounts[group._id.scoringStatus] += group.count;
        }
    }

    return products.map((product) => ({
        ...product,
        // This is a database registration state, not an authenticity decision.
        status: "REGISTERED",
        ...metricsByProduct.get(product.productCode),
        // Retain the old property for existing consumers; it counts all verification records.
        totalScans: metricsByProduct.get(product.productCode).totalVerifications
    }));
};

const listManufacturerProducts = async (userId, overrides = {}) => {
    const deps = createDependencies(overrides);
    const manufacturer = await deps.Manufacturer.findOne({ userId });
    if (!manufacturer) {
        throw new Error("Manufacturer profile not found");
    }

    const products = await deps.Product.find({ manufacturerId: manufacturer._id })
        .sort({ createdAt: -1 })
        .lean();
    return addVerificationMetrics(products, deps.Verification);
};

const listAllProducts = async (overrides = {}) => {
    const deps = createDependencies(overrides);
    const products = await deps.Product.find()
        .populate("manufacturerId", "companyName")
        .sort({ createdAt: -1 })
        .lean();

    const enriched = await addVerificationMetrics(products, deps.Verification);
    return enriched.map((product) => ({
        ...product,
        manufacturer: product.manufacturerId?.companyName || "Unknown",
        manufacturerId: product.manufacturerId?._id || product.manufacturerId,
        timestamp: product.mintedAt?.toISOString?.() || null,
        qrHash: null
    }));
};

const listAllProductsPaginated = async ({ page = 1, pageSize = 20 } = {}, overrides = {}) => {
    const deps = createDependencies(overrides);
    const total = await deps.Product.countDocuments();
    const products = await deps.Product.find()
        .populate("manufacturerId", "companyName")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean();

    const enriched = await addVerificationMetrics(products, deps.Verification);
    return {
        products: enriched.map((product) => ({
            ...product,
            manufacturer: product.manufacturerId?.companyName || "Unknown",
            manufacturerId: product.manufacturerId?._id || product.manufacturerId,
            timestamp: product.mintedAt?.toISOString?.() || null,
            qrHash: null
        })),
        pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize)
        }
    };
};

module.exports = {
    IPFS_IMAGE_HASH,
    registrationError,
    cleanProductInput,
    resolveSavedRegistrationVersion,
    allocateProductCode,
    prepareProductRegistration,
    confirmProductRegistration,
    claimProductRegistrationMint,
    listPendingProductRegistrations,
    getApprovedPartners,
    listManufacturerProducts,
    listAllProducts,
    listAllProductsPaginated
};
