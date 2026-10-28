const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveProductRegistryIdentity } = require("../services/productRegistryIdentity");

const address = "0x1111111111111111111111111111111111111111";
const context = {
    blockchainV1: { CONTRACT_ADDRESS: address, SEPOLIA_CHAIN_ID: 11155111 },
    blockchainV2: { CONTRACT_ADDRESS: "0x2222222222222222222222222222222222222222", SEPOLIA_CHAIN_ID: 11155111 }
};
const baseProduct = {
    productCode: "FPD-HIST-1",
    transactionHash: `0x${"a".repeat(64)}`,
    manufacturerId: "manufacturer-profile"
};

test("explicit V1 identity is preserved", () => {
    const result = resolveProductRegistryIdentity({
        product: { ...baseProduct, registryVersion: 1, registryAddress: address, chainId: 11155111 },
        ...context
    });
    assert.deepEqual(result, {
        status: "RESOLVED",
        version: 1,
        address,
        chainId: 11155111,
        source: "PRODUCT_RECORD"
    });
});

test("missing product identity can be recovered from its matching completed registration transaction", () => {
    const registration = {
        status: "COMPLETE",
        productCode: baseProduct.productCode,
        transactionHash: baseProduct.transactionHash,
        manufacturerId: baseProduct.manufacturerId,
        registryVersion: 1,
        preparedTransaction: { to: address, chainId: 11155111, registryVersion: 1 }
    };
    const result = resolveProductRegistryIdentity({ product: baseProduct, registration, ...context });
    assert.deepEqual(result, {
        status: "RESOLVED",
        version: 1,
        address,
        chainId: 11155111,
        source: "COMPLETED_REGISTRATION_TRANSACTION"
    });
});

test("missing identity and ambiguous provenance remain unresolved", () => {
    const noRegistration = resolveProductRegistryIdentity({ product: baseProduct, ...context });
    assert.equal(noRegistration.status, "UNRESOLVED");
    assert.equal(noRegistration.reason, "HISTORICAL_REGISTRY_PROVENANCE_MISSING");

    const partialIdentity = resolveProductRegistryIdentity({
        product: { ...baseProduct, registryAddress: "0x3333333333333333333333333333333333333333", chainId: 11155111 },
        ...context
    });
    assert.equal(partialIdentity.status, "UNRESOLVED");
    assert.equal(partialIdentity.reason, "INCOMPLETE_OR_AMBIGUOUS_REGISTRY_IDENTITY");
});

test("a registration that conflicts with saved product identity is not selected", () => {
    const registration = {
        status: "COMPLETE",
        productCode: baseProduct.productCode,
        transactionHash: baseProduct.transactionHash,
        manufacturerId: baseProduct.manufacturerId,
        registryVersion: 2,
        preparedTransaction: { to: context.blockchainV2.CONTRACT_ADDRESS, chainId: 11155111, registryVersion: 2 }
    };
    const result = resolveProductRegistryIdentity({
        product: { ...baseProduct, registryVersion: 1, registryAddress: address, chainId: 11155111 },
        registration,
        ...context
    });
    assert.equal(result.status, "UNRESOLVED");
    assert.equal(result.reason, "PRODUCT_AND_REGISTRATION_IDENTITY_CONFLICT");
});
