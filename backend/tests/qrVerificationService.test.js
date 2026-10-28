const test = require("node:test");
const assert = require("node:assert/strict");
const qrVerificationService = require("../services/qrVerificationService");
const blockchainService = require("../services/blockchainService");

const hash = "a".repeat(64);
const product = {
    productCode: "FPD0001",
    productName: "Sample Product",
    brandName: "Sample Brand",
    category: "Personal Care",
    productHash: hash,
    imageHash: "b".repeat(64),
    manufacturerId: { companyName: "Sample Manufacturer" },
    registryVersion: 1,
    registryAddress: "0x5555555555555555555555555555555555555555",
    chainId: 11155111
};

const payload = (overrides = {}) => JSON.stringify({
    productCode: product.productCode,
    productName: product.productName,
    brandName: product.brandName,
    category: product.category,
    productHash: hash,
    ...overrides
});

const run = async ({ storedProduct = product, chainResult = {
    exists: true,
    isActive: true,
    isFlagged: false,
    product: { productId: product.productCode, productHash: hash }
}, code = product.productCode, qrPayload = payload() } = {}) => {
    const calls = { db: 0, chain: 0, mutating: 0 };
    const model = {
        findOne(query) {
            calls.db += 1;
            assert.deepEqual(query, { productCode: code });
            return {
                populate() {
                    return { lean: async () => storedProduct };
                }
            };
        }
    };
    const chain = {
        CONTRACT_ADDRESS: product.registryAddress,
        SEPOLIA_CHAIN_ID: 11155111,
        async verifyProductOnBlockchain(requestedCode) {
            calls.chain += 1;
            assert.equal(requestedCode, code);
            return chainResult;
        },
        async verifyProduct() { calls.mutating += 1; }
    };
    const result = await qrVerificationService.verifyQrProduct({ productCode: code, qrPayload }, {
        Product: model,
        blockchainService: chain
    });
    return { result, calls };
};

test("valid QR requires matching Mongo and blockchain hashes", async () => {
    const { result, calls } = await run();
    assert.equal(result.verified, true);
    assert.equal(result.status, "GENUINE");
    assert.equal(result.blockchain.qrMatched, true);
    assert.equal(calls.mutating, 0);
});

test("QR route product code mismatch is rejected before lookups", async () => {
    const { result } = await run({ code: "FPD0002" });
    assert.equal(result.verified, false);
    assert.equal(result.status, "INVALID_QR");
});

test("QR payload product ID cannot be substituted while keeping the requested route", async () => {
    const { result } = await run({ qrPayload: payload({ productCode: "FPD0002" }) });
    assert.equal(result.verified, false);
    assert.equal(result.status, "INVALID_QR");
});

test("malformed and incomplete QR payloads are rejected", async (t) => {
    for (const qrPayload of ["not-json", "https://example.test/FPD0001", "FPD0001", JSON.stringify({ productCode: "FPD0001" })]) {
        await t.test(qrPayload.slice(0, 30), async () => {
            const { result } = await run({ qrPayload });
            assert.equal(result.verified, false);
            assert.equal(result.status, "INVALID_QR");
        });
    }
});

test("legacy structured QR without a hash remains valid after record comparison", async () => {
    const { result } = await run({ qrPayload: payload({ productHash: undefined }) });
    assert.equal(result.verified, true);
});

test("missing Mongo and blockchain records are not registered", async () => {
    const { result } = await run({
        storedProduct: null,
        chainResult: { exists: false, isActive: false, isFlagged: false, product: null }
    });
    assert.equal(result.verified, false);
    assert.equal(result.status, "NOT_REGISTERED");
});

test("a blockchain record without its Mongo record is not genuine", async () => {
    const { result } = await run({ storedProduct: null });
    assert.equal(result.verified, false);
    assert.equal(result.status, "NOT_REGISTERED");
});

test("database and blockchain product hash mismatch is rejected", async () => {
    const { result } = await run({ chainResult: {
        exists: true, isActive: true, isFlagged: false,
        product: { productId: product.productCode, productHash: "c".repeat(64) }
    } });
    assert.equal(result.verified, false);
    assert.equal(result.status, "INVALID_QR");
});

test("flagged products cannot be genuine", async () => {
    const { result } = await run({ chainResult: {
        exists: true, isActive: false, isFlagged: true,
        product: { productId: product.productCode, productHash: hash }
    } });
    assert.equal(result.verified, false);
    assert.equal(result.status, "FLAGGED");
});

test("QR verifier calls only the read-only blockchain wrapper", async () => {
    const { result, calls } = await run();
    assert.equal(result.verified, true);
    assert.equal(calls.chain, 1);
    assert.equal(calls.mutating, 0);
    assert.equal(blockchainService.contractInterface.getFunction("getProduct").stateMutability, "view");
    assert.equal(blockchainService.contractInterface.getFunction("isProductFlagged").stateMutability, "view");
    assert.equal(blockchainService.contractInterface.getFunction("verifyProduct").stateMutability, "nonpayable");
});

test("V2 QR verification uses the product's registry identity and remains read-only", async () => {
    const v2Address = "0x6666666666666666666666666666666666666666";
    const storedProduct = { ...product, registryVersion: 2, registryAddress: v2Address, chainId: 11155111 };
    let v1Calls = 0;
    let v2Calls = 0;
    let registryOptions;
    const result = await qrVerificationService.verifyQrProduct({
        productCode: product.productCode,
        qrPayload: payload()
    }, {
        Product: {
            findOne: () => ({ populate: () => ({ lean: async () => storedProduct }) })
        },
        blockchainService: {
            verifyProductOnBlockchain: async () => { v1Calls += 1; }
        },
        blockchainV2Service: {
            CONTRACT_ADDRESS: v2Address,
            SEPOLIA_CHAIN_ID: 11155111,
            verifyProductOnBlockchain: async (_code, options) => {
                v2Calls += 1;
                registryOptions = options;
                return {
                    exists: true,
                    isActive: true,
                    isFlagged: false,
                    product: { productId: product.productCode, productHash: hash }
                };
            }
        }
    });
    assert.equal(result.verified, true);
    assert.equal(result.status, "GENUINE");
    assert.equal(v1Calls, 0);
    assert.equal(v2Calls, 1);
    assert.deepEqual(registryOptions, { registryAddress: v2Address });
});

test("legacy product with missing registry identity is unresolved unless a matching completed registration proves it", async (t) => {
    const ambiguousProduct = { ...product, registryVersion: undefined, registryAddress: undefined, chainId: undefined, transactionHash: `0x${"b".repeat(64)}` };
    let chainCalls = 0;
    const common = {
        Product: { findOne: () => ({ populate: () => ({ lean: async () => ambiguousProduct }) }) },
        ProductRegistration: { findOne: () => ({ lean: async () => null }) },
        blockchainService: {
            CONTRACT_ADDRESS: product.registryAddress,
            SEPOLIA_CHAIN_ID: 11155111,
            verifyProductOnBlockchain: async () => {
                chainCalls += 1;
                return { exists: true, isActive: true, isFlagged: false, product: { productId: product.productCode, productHash: hash } };
            }
        },
        blockchainV2Service: { SEPOLIA_CHAIN_ID: 11155111 }
    };
    const unresolved = await qrVerificationService.verifyQrProduct({ productCode: product.productCode, qrPayload: payload() }, common);
    assert.equal(unresolved.status, "REGISTRY_UNRESOLVED");
    assert.equal(chainCalls, 0);

    await t.test("matching registration is used as provenance", async () => {
        const resolved = await qrVerificationService.verifyQrProduct({ productCode: product.productCode, qrPayload: payload() }, {
            ...common,
            ProductRegistration: {
                findOne: () => ({ lean: async () => ({
                    status: "COMPLETE",
                    productCode: ambiguousProduct.productCode,
                    transactionHash: ambiguousProduct.transactionHash,
                    manufacturerId: ambiguousProduct.manufacturerId,
                    registryVersion: 1,
                    preparedTransaction: { to: product.registryAddress, chainId: 11155111 }
                }) })
            }
        });
        assert.equal(resolved.verified, true);
        assert.equal(chainCalls, 1);
    });
});

test("invalid payload hash and mismatched payload hash are rejected", async (t) => {
    for (const qrPayload of [payload({ productHash: "bad" }), payload({ productHash: "c".repeat(64) })]) {
        await t.test("invalid supplied hash", async () => {
            const { result } = await run({ qrPayload });
            assert.equal(result.verified, false);
            assert.equal(result.status, "INVALID_QR");
        });
    }
});
