const test = require("node:test");
const assert = require("node:assert/strict");
const ethers = require("ethers");
const registry = require("../services/blockchainV2Service");

const address = "0x5555555555555555555555555555555555555555";

test("V2 ABI exposes each explicit lifecycle step and read-only QR verification", () => {
    const expected = [
        "dispatchToDistributor", "receiveByDistributor", "dispatchToRetailer",
        "receiveByRetailer", "recordSale", "getProduct", "getProductState", "getRole", "verifyProduct"
    ];
    for (const method of expected) assert.ok(registry.contractInterface.getFunction(method), method);
    assert.equal(registry.contractInterface.getFunction("verifyProduct").stateMutability, "view");
    for (const method of expected.slice(0, 5)) {
        assert.equal(registry.contractInterface.getFunction(method).stateMutability, "nonpayable");
    }
});

test("V2 lifecycle transaction encoder accepts only named actions", () => {
    const encoded = registry.encodeLifecycleTransaction("RECEIVE_BY_DISTRIBUTOR", "FPD-V2-1");
    const parsed = registry.contractInterface.parseTransaction({ data: encoded });
    assert.equal(parsed.name, "receiveByDistributor");
    assert.equal(parsed.args[0], "FPD-V2-1");
    assert.throws(() => registry.encodeLifecycleTransaction("ARBITRARY_CALL", "FPD-V2-1"), /unsupported/i);
});

test("V2 indexed product event topic is checked against the plaintext expected ID", () => {
    const productCode = "FPD-V2-1";
    const fragment = registry.contractInterface.getEvent("ProductLifecycleEvent");
    const values = [productCode, address, address, 0, 1, address, 1790000000];
    const encoded = registry.contractInterface.encodeEventLog(fragment, values);
    const receipt = { logs: [{ address, ...encoded, index: 4, transactionHash: `0x${"a".repeat(64)}`, blockNumber: 99 }] };
    const parsed = registry.parseLifecycleEvent(receipt, { productCode, contractAddress: address });
    assert.equal(parsed.productCode, productCode);
    assert.equal(parsed.productIdTopic, ethers.keccak256(ethers.toUtf8Bytes(productCode)));
    assert.equal(parsed.actor, address);
    assert.equal(parsed.previousState, 0);
    assert.equal(parsed.newState, 1);
    assert.equal(parsed.logIndex, 4);
    assert.equal(parsed.transactionHash, `0x${"a".repeat(64)}`);
    assert.equal(parsed.blockNumber, 99);
    assert.equal(registry.parseLifecycleEvent(receipt, { productCode: "OTHER", contractAddress: address }), null);
    assert.equal(registry.parseLifecycleEvent(receipt, { productCode, contractAddress: "0x6666666666666666666666666666666666666666" }), null);
});
