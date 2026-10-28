const { ethers } = require("ethers");
const crypto = require("crypto");
const path = require("path");

const artifact = require(
    path.join(
        __dirname,
        "../../blockchain/artifacts/contracts/ProductRegistry.sol/ProductRegistry.json"
    )
);

const SEPOLIA_CHAIN_ID = 11155111n;
const configuredChainId = BigInt(process.env.CHAIN_ID || "0");
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS
    ? ethers.getAddress(process.env.CONTRACT_ADDRESS)
    : null;
const provider = new ethers.JsonRpcProvider(
    process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545"
);
const contractInterface = new ethers.Interface(artifact.abi);
let contract;

const getContract = (address = CONTRACT_ADDRESS) => {
    if (!address) throw new Error("CONTRACT_ADDRESS is not configured");
    const normalized = ethers.getAddress(address);
    if (normalized === CONTRACT_ADDRESS) {
        if (!contract) contract = new ethers.Contract(normalized, contractInterface, provider);
        return contract;
    }
    return new ethers.Contract(normalized, contractInterface, provider);
};

const ROLE = Object.freeze({
    MANUFACTURER: 1,
    DISTRIBUTOR: 2,
    RETAILER: 3
});

const assertSepolia = async (address = CONTRACT_ADDRESS) => {
    if (!address || !process.env.BLOCKCHAIN_RPC_URL) {
        throw new Error("Sepolia contract configuration is incomplete");
    }

    if (configuredChainId !== SEPOLIA_CHAIN_ID) {
        throw new Error("Backend CHAIN_ID must be 11155111 (Sepolia)");
    }

    const network = await provider.getNetwork();
    if (network.chainId !== SEPOLIA_CHAIN_ID) {
        throw new Error("Configured blockchain RPC is not connected to Sepolia");
    }

    const code = await provider.getCode(ethers.getAddress(address));
    if (code === "0x") {
        throw new Error("Configured contract address has no deployed code on Sepolia");
    }
};

const normalizeAddress = (address) => ethers.getAddress(address);

const createProductHash = ({
    productCode,
    manufacturerId,
    productName,
    category,
    brandName,
    batchNumber,
    manufacturingDate,
    price = null,
    description = ""
}) => {
    const canonicalProduct = {
        schemaVersion: 1,
        productCode: String(productCode).trim(),
        manufacturerId: String(manufacturerId).trim(),
        productName: String(productName).trim(),
        category: String(category).trim(),
        brandName: String(brandName).trim(),
        batchNumber: String(batchNumber).trim(),
        manufacturingDate: new Date(manufacturingDate).toISOString(),
        price: price === null || price === "" ? null : Number(price),
        description: String(description).trim()
    };

    return crypto
        .createHash("sha256")
        .update(JSON.stringify(canonicalProduct), "utf8")
        .digest("hex");
};

const createImageHash = (imageBuffer) =>
    crypto.createHash("sha256").update(imageBuffer).digest("hex");

const createQRHash = (qrData) =>
    crypto.createHash("sha256").update(qrData).digest("hex");

const getRole = async (address) => {
    await assertSepolia();
    return Number(await getContract().getRole(normalizeAddress(address)));
};

const prepareMintTransaction = async ({
    productCode,
    manufacturerId,
    productHash,
    authorizedDistributor,
    authorizedRetailer
}) => {
    await assertSepolia();

    const data = encodeMintProductData({
        productCode,
        manufacturerId,
        productHash,
        ipfsImageHash: "",
        authorizedDistributor,
        authorizedRetailer
    });

    return {
        to: CONTRACT_ADDRESS,
        data,
        chainId: Number(SEPOLIA_CHAIN_ID),
        value: "0x0"
    };
};

const encodeMintProductData = ({
    productCode,
    manufacturerId,
    productHash,
    ipfsImageHash = "",
    authorizedDistributor,
    authorizedRetailer
}) => contractInterface.encodeFunctionData("mintProduct", [
    productCode,
    manufacturerId,
    productHash,
    ipfsImageHash,
    normalizeAddress(authorizedDistributor),
    normalizeAddress(authorizedRetailer)
]);

const waitForMintTransaction = async (transactionHash, timeoutMs = 120000) => {
    await assertSepolia();
    const receipt = await provider.waitForTransaction(
        transactionHash,
        1,
        timeoutMs
    );

    if (!receipt) {
        throw new Error("Timed out waiting for the Sepolia mint transaction");
    }

    const transaction = await provider.getTransaction(transactionHash);
    if (!transaction) {
        throw new Error("Confirmed transaction details are unavailable");
    }

    return { receipt, transaction };
};

const getProductFromBlockchain = async (productCode, { registryAddress = CONTRACT_ADDRESS } = {}) => {
    await assertSepolia(registryAddress);

    try {
        const product = await getContract(registryAddress).getProduct(productCode);
        return {
            productId: product.productId,
            manufacturerId: product.manufacturerId,
            productHash: product.productHash,
            ipfsImageHash: product.ipfsImageHash,
            mintedAt: Number(product.mintedAt),
            state: Number(product.state),
            currentOwner: product.currentOwner,
            authorizedDistributor: product.authorizedDistributor,
            authorizedRetailer: product.authorizedRetailer
        };
    } catch (error) {
        const details = [
            error.reason,
            error.shortMessage,
            error.message,
            error.info?.error?.message
        ].filter(Boolean).join(" ");

        if (details.includes("Product not found")) {
            return null;
        }

        throw error;
    }
};

const verifyProductOnBlockchain = async (productCode, options = {}) => {
    const product = await getProductFromBlockchain(productCode, options);
    if (!product) {
        return {
            exists: false,
            isActive: false,
            isFlagged: false,
            qrHash: null,
            product: null
        };
    }

    const flagged = await getContract(options.registryAddress || CONTRACT_ADDRESS).isProductFlagged(productCode);
    return {
        exists: true,
        isActive: product.state !== 3 && product.state !== 4,
        isFlagged: Boolean(flagged) || product.state === 4,
        // This is a local QR payload hash, not a hash anchored in the contract.
        qrHash: createQRHash(productCode),
        product
    };
};

const deactivateProductOnBlockchain = async () => {
    throw new Error("The deployed ProductRegistry has no deactivateProduct method");
};

const parseProductMintedEvent = (receipt, expectedProductCode, expectedContractAddress) => {
    if (!receipt || !expectedProductCode || !expectedContractAddress) return null;

    const eventFragment = contractInterface.getEvent("ProductMinted");
    const expectedProductTopic = ethers.keccak256(
        ethers.toUtf8Bytes(String(expectedProductCode))
    ).toLowerCase();

    for (const log of receipt.logs || []) {
        if (
            log.address.toLowerCase() !== expectedContractAddress.toLowerCase() ||
            log.topics?.[0]?.toLowerCase() !== eventFragment.topicHash.toLowerCase() ||
            log.topics?.[1]?.toLowerCase() !== expectedProductTopic
        ) {
            continue;
        }

        try {
            const parsed = contractInterface.parseLog(log);
            if (parsed?.name === "ProductMinted") {
                return {
                    // Indexed dynamic strings are represented by their topic hash.
                    // Return plaintext only after the topic matches the expected ID.
                    productId: String(expectedProductCode),
                    productIdTopic: expectedProductTopic,
                    manufacturerId: parsed.args.manufacturerId,
                    productHash: parsed.args.productHash,
                    ipfsImageHash: parsed.args.ipfsImageHash,
                    timestamp: Number(parsed.args.timestamp)
                };
            }
        } catch {
            // Ignore logs that do not belong to a ProductRegistry event.
        }
    }

    return null;
};

const getMintEvent = (receipt, expectedProductCode) =>
    parseProductMintedEvent(receipt, expectedProductCode, CONTRACT_ADDRESS);

module.exports = {
    ROLE,
    SEPOLIA_CHAIN_ID: Number(SEPOLIA_CHAIN_ID),
    CONTRACT_ADDRESS,
    contractInterface,
    assertSepolia,
    normalizeAddress,
    createProductHash,
    createImageHash,
    createQRHash,
    encodeMintProductData,
    getRole,
    prepareMintTransaction,
    waitForMintTransaction,
    getProductFromBlockchain,
    getMintEvent,
    parseProductMintedEvent,
    verifyProductOnBlockchain,
    deactivateProductOnBlockchain
};
