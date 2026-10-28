const test = require("node:test");
const assert = require("node:assert/strict");
const { ethers } = require("ethers");
const artifact = require("../../blockchain/artifacts/contracts/ProductRegistry.sol/ProductRegistry.json");
const { parseProductMintedEvent } = require("../services/blockchainService");

const registryAddress = "0x4444444444444444444444444444444444444444";
const iface = new ethers.Interface(artifact.abi);

function receiptFor(productCode, emitter = registryAddress) {
    const encoded = iface.encodeEventLog("ProductMinted", [
        productCode,
        "manufacturer-profile-id",
        "a".repeat(64),
        "",
        1777593600
    ]);
    return {
        logs: [{ address: emitter, topics: encoded.topics, data: encoded.data }]
    };
}

test("ProductMinted indexed string topic is matched by hash, not decoded as plaintext", () => {
    const productCode = "FPD9001";
    const receipt = receiptFor(productCode);
    const decoded = parseProductMintedEvent(receipt, productCode, registryAddress);

    assert.equal(typeof iface.parseLog(receipt.logs[0]).args.productId, "object");
    assert.equal(decoded.productId, productCode);
    assert.equal(
        decoded.productIdTopic,
        ethers.keccak256(ethers.toUtf8Bytes(productCode))
    );
    assert.equal(decoded.manufacturerId, "manufacturer-profile-id");
    assert.equal(decoded.productHash, "a".repeat(64));
});

test("ProductMinted event is rejected when indexed product ID or emitter does not match", () => {
    const productCode = "FPD9002";
    assert.equal(
        parseProductMintedEvent(receiptFor(productCode), "FPD9003", registryAddress),
        null
    );
    assert.equal(
        parseProductMintedEvent(receiptFor(productCode, "0x5555555555555555555555555555555555555555"), productCode, registryAddress),
        null
    );
});
