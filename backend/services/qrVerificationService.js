const Product = require("../models/Product");
const ProductRegistration = require("../models/ProductRegistration");
const blockchainService = require("./blockchainService");
const blockchainV2Service = require("./blockchainV2Service");
const { resolveProductRegistryIdentity } = require("./productRegistryIdentity");

const SHA256_HEX = /^[a-f0-9]{64}$/i;

const failure = (status, message, blockchain = {}) => ({
    verified: false,
    status,
    message,
    product: null,
    blockchain: {
        checked: false,
        exists: false,
        active: false,
        flagged: false,
        qrMatched: false,
        ...blockchain
    }
});

const nonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const parseQrPayload = (rawPayload) => {
    if (typeof rawPayload !== "string" || rawPayload.length > 4096) return null;

    let payload;
    try {
        payload = JSON.parse(rawPayload);
    } catch {
        return null;
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

    const productCode = payload.productCode ?? payload.productId;
    if (!nonEmptyString(productCode)) return null;
    if (payload.productCode !== undefined && !nonEmptyString(payload.productCode)) return null;
    if (payload.productId !== undefined && !nonEmptyString(payload.productId)) return null;
    if (
        payload.productCode !== undefined &&
        payload.productId !== undefined &&
        payload.productCode.trim() !== payload.productId.trim()
    ) return null;

    if (![payload.productName, payload.brandName, payload.category].every(nonEmptyString)) return null;
    if (payload.productHash !== undefined && (typeof payload.productHash !== "string" || !SHA256_HEX.test(payload.productHash))) return null;

    return {
        productCode: productCode.trim(),
        productName: payload.productName.trim(),
        brandName: payload.brandName.trim(),
        category: payload.category.trim(),
        productHash: payload.productHash?.toLowerCase()
    };
};

const lookupProduct = async (model, productCode) => {
    let query = model.findOne({ productCode });
    if (query && typeof query.populate === "function") {
        query = query.populate("manufacturerId", "companyName");
    }
    if (query && typeof query.lean === "function") query = query.lean();
    return query;
};

const lookupCompletedRegistration = async (model, product) => {
    if (!product?.transactionHash) return null;
    const query = model.findOne({
        productCode: product.productCode,
        transactionHash: product.transactionHash,
        status: "COMPLETE"
    });
    return query?.lean ? query.lean() : query;
};

const verifySavedProduct = async ({ productCode, qrPayload, allowCodeOnly = false }, overrides = {}) => {
    const deps = { Product, ProductRegistration, blockchainService, blockchainV2Service, ...overrides };
    const payload = allowCodeOnly ? null : parseQrPayload(qrPayload);
    const routeCode = typeof productCode === "string" ? productCode.trim() : "";

    if (
        !routeCode || routeCode.length > 64 ||
        (!allowCodeOnly && (!payload || payload.productCode !== routeCode))
    ) {
        return failure(
            allowCodeOnly ? "INVALID_PRODUCT_CODE" : "INVALID_QR",
            allowCodeOnly
                ? "Product code is missing or invalid."
                : "QR payload is malformed, incomplete, or does not match the requested product."
        );
    }

    const storedProduct = await lookupProduct(deps.Product, routeCode);
    if (!storedProduct) return failure("NOT_REGISTERED", "Product has no saved application registration.");
    const registration = await lookupCompletedRegistration(deps.ProductRegistration, storedProduct);
    const identity = resolveProductRegistryIdentity({
        product: storedProduct,
        registration,
        blockchainV1: deps.blockchainService,
        blockchainV2: deps.blockchainV2Service
    });
    if (identity.status !== "RESOLVED") {
        return failure("REGISTRY_UNRESOLVED", "The product's original registry cannot be established from saved records.");
    }
    const registryVersion = identity.version;
    const selectedBlockchain = registryVersion === 2 ? deps.blockchainV2Service : deps.blockchainService;
    const expectedChainId = Number(selectedBlockchain.SEPOLIA_CHAIN_ID || 0);
    if (!expectedChainId || identity.chainId !== expectedChainId) {
        return failure("REGISTRY_UNAVAILABLE", "The saved product registry is on a different or unsupported chain.");
    }
    const chainResult = await selectedBlockchain.verifyProductOnBlockchain(
        routeCode,
        { registryAddress: identity.address }
    );

    if (!chainResult?.exists && !storedProduct) {
        return failure("NOT_REGISTERED", "Product is not registered.", { checked: true });
    }

    if (!chainResult?.exists) {
        return failure("INVALID_QR", "Product database and blockchain records do not agree.", { checked: true });
    }

    if (chainResult.isFlagged) {
        return failure("FLAGGED", "Product has been flagged on the blockchain.", {
            checked: true, exists: true, active: chainResult.isActive, flagged: true
        });
    }

    if (!chainResult.isActive) {
        return failure("DEACTIVATED", "Product has been deactivated.", {
            checked: true, exists: true, active: false
        });
    }

    const chainProduct = chainResult.product;
    const dbHash = storedProduct?.productHash;
    const chainHash = chainProduct?.productHash;
    if (!storedProduct || !chainProduct || !SHA256_HEX.test(String(dbHash || "")) || !SHA256_HEX.test(String(chainHash || ""))) {
        return failure("INVALID_QR", "Product records are incomplete or do not contain a valid product hash.", {
            checked: true, exists: true, active: true
        });
    }

    const normalizedDbHash = dbHash.toLowerCase();
    const normalizedChainHash = chainHash.toLowerCase();
    const metadataMatches = storedProduct.productCode === routeCode && (
        allowCodeOnly || (
            storedProduct.productName?.trim() === payload.productName &&
            storedProduct.brandName?.trim() === payload.brandName &&
            storedProduct.category?.trim() === payload.category
        )
    );

    if (
        normalizedDbHash !== normalizedChainHash ||
        (payload?.productHash && payload.productHash !== normalizedDbHash) ||
        !metadataMatches
    ) {
        return failure("INVALID_QR", allowCodeOnly
            ? "Saved product and blockchain records do not agree."
            : "QR, database, and blockchain product records do not agree.", {
            checked: true, exists: true, active: true
        });
    }

    return {
        verified: true,
        status: "GENUINE",
        message: allowCodeOnly
            ? "The saved product record matches its active blockchain registry record."
            : "Product records match the blockchain.",
        verificationMethod: allowCodeOnly ? "MANUAL_CODE" : "QR",
        product: storedProduct,
        blockchain: {
            checked: true,
            exists: true,
            active: true,
            flagged: false,
            qrMatched: !allowCodeOnly,
            manualCodeMatched: allowCodeOnly,
            productHash: normalizedChainHash
        }
    };
};

const verifyQrProduct = (input, overrides = {}) =>
    verifySavedProduct({ ...input, allowCodeOnly: false }, overrides);

const verifyProductCode = ({ productCode }, overrides = {}) =>
    verifySavedProduct({ productCode, allowCodeOnly: true }, overrides);

module.exports = { parseQrPayload, verifyQrProduct, verifyProductCode, lookupCompletedRegistration };
