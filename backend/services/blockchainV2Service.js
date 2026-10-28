const { ethers } = require("ethers");
const path = require("path");

const artifact = require(
    path.join(__dirname, "../../blockchain/artifacts/contracts/ProductRegistryV2.sol/ProductRegistryV2.json")
);
const SEPOLIA_CHAIN_ID = 11155111n;
const REGISTRY_VERSION = 2;
const ROLE = Object.freeze({ MANUFACTURER: 1, DISTRIBUTOR: 2, RETAILER: 3 });
const configuredChainId = BigInt(process.env.CHAIN_ID || "0");
const CONTRACT_ADDRESS = process.env.PRODUCT_REGISTRY_V2_ADDRESS
    ? ethers.getAddress(process.env.PRODUCT_REGISTRY_V2_ADDRESS)
    : null;
const provider = new ethers.JsonRpcProvider(
    process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545"
);
const contractInterface = new ethers.Interface(artifact.abi);
let contract;

const getContract = (address = CONTRACT_ADDRESS) => {
    if (!address) throw new Error("ProductRegistry V2 is not configured");
    return new ethers.Contract(ethers.getAddress(address), contractInterface, provider);
};

const assertSepolia = async (address = CONTRACT_ADDRESS) => {
    if (!CONTRACT_ADDRESS || !address || ethers.getAddress(address) !== CONTRACT_ADDRESS || !process.env.BLOCKCHAIN_RPC_URL) {
        throw new Error("Sepolia ProductRegistry V2 configuration is incomplete");
    }
    if (configuredChainId !== SEPOLIA_CHAIN_ID) {
        throw new Error("Backend CHAIN_ID must be 11155111 (Sepolia)");
    }
    const network = await provider.getNetwork();
    if (network.chainId !== SEPOLIA_CHAIN_ID) {
        throw new Error("Configured blockchain RPC is not connected to Sepolia");
    }
    const code = await provider.getCode(address);
    if (code === "0x") throw new Error("Configured ProductRegistry V2 has no deployed code on Sepolia");
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
    ethers.getAddress(authorizedDistributor),
    ethers.getAddress(authorizedRetailer)
]);

const prepareMintTransaction = async (args) => {
    await assertSepolia();
    return {
        to: CONTRACT_ADDRESS,
        data: encodeMintProductData(args),
        chainId: Number(SEPOLIA_CHAIN_ID),
        registryVersion: 2,
        value: "0x0"
    };
};

const getRole = async (address) => {
    await assertSepolia();
    return Number(await getContract().getRole(ethers.getAddress(address)));
};

const waitForMintTransaction = async (transactionHash, timeoutMs = 120000) => {
    await assertSepolia();
    const receipt = await provider.waitForTransaction(transactionHash, 1, timeoutMs);
    if (!receipt) throw new Error("Timed out waiting for the Sepolia mint transaction");
    const transaction = await provider.getTransaction(transactionHash);
    if (!transaction) throw new Error("Confirmed transaction details are unavailable");
    return { receipt, transaction };
};

const parseProductMintedEvent = (receipt, expectedProductCode, expectedContractAddress = CONTRACT_ADDRESS) => {
    if (!receipt || !expectedProductCode || !expectedContractAddress) return null;
    const eventFragment = contractInterface.getEvent("ProductMinted");
    const expectedTopic = ethers.keccak256(ethers.toUtf8Bytes(String(expectedProductCode))).toLowerCase();
    for (const log of receipt.logs || []) {
        if (
            String(log.address).toLowerCase() !== String(expectedContractAddress).toLowerCase() ||
            log.topics?.[0]?.toLowerCase() !== eventFragment.topicHash.toLowerCase() ||
            log.topics?.[1]?.toLowerCase() !== expectedTopic
        ) continue;
        try {
            const parsed = contractInterface.parseLog(log);
            if (parsed?.name !== "ProductMinted") continue;
            return {
                productId: String(expectedProductCode),
                productIdTopic: expectedTopic,
                manufacturerId: parsed.args.manufacturerId,
                productHash: parsed.args.productHash,
                ipfsImageHash: parsed.args.ipfsImageHash,
                timestamp: Number(parsed.args.timestamp)
            };
        } catch {
            // Ignore unrelated or malformed logs.
        }
    }
    return null;
};

const getProductFromBlockchain = (productCode) => getProduct(productCode);
const getMintEvent = (receipt, productCode) =>
    parseProductMintedEvent(receipt, productCode, CONTRACT_ADDRESS);

const getProduct = async (productCode, { blockTag, registryAddress = CONTRACT_ADDRESS } = {}) => {
    if (CONTRACT_ADDRESS && registryAddress && ethers.getAddress(registryAddress) !== CONTRACT_ADDRESS) {
        throw new Error("Product registry address does not match configured ProductRegistry V2");
    }
    await assertSepolia(registryAddress);
    const instance = getContract(registryAddress);
    try {
        const p = blockTag === undefined
            ? await instance.getProduct(productCode)
            : await instance.getProduct(productCode, { blockTag });
        return {
            productId: p.storedProductId,
            manufacturerId: p.manufacturerId,
            productHash: p.productHash,
            ipfsImageHash: p.ipfsImageHash,
            mintedAt: Number(p.mintedAt),
            state: Number(p.state),
            manufacturer: p.manufacturer,
            currentOwner: p.currentCustodian,
            currentCustodian: p.currentCustodian,
            authorizedDistributor: p.authorizedDistributor,
            authorizedRetailer: p.authorizedRetailer
        };
    } catch (error) {
        const message = [error.reason, error.shortMessage, error.message].filter(Boolean).join(" ");
        if (message.includes("Product not found")) return null;
        throw error;
    }
};

const verifyProductOnBlockchain = async (productCode, options = {}) => {
    const product = await getProduct(productCode, options);
    if (!product) return { exists: false, isActive: false, isFlagged: false, product: null };
    const flagged = await getContract(options.registryAddress || CONTRACT_ADDRESS).isProductFlagged(productCode);
    return {
        exists: true,
        isActive: product.state !== 6,
        isFlagged: Boolean(flagged) || product.state === 6,
        product
    };
};

const LIFECYCLE_METHODS = Object.freeze({
    DISPATCH_TO_DISTRIBUTOR: "dispatchToDistributor",
    RECEIVE_BY_DISTRIBUTOR: "receiveByDistributor",
    DISPATCH_TO_RETAILER: "dispatchToRetailer",
    RECEIVE_BY_RETAILER: "receiveByRetailer",
    RECORD_SALE: "recordSale"
});

const encodeLifecycleTransaction = (action, productCode) => {
    const method = LIFECYCLE_METHODS[action];
    if (!method) throw new Error("Unsupported product lifecycle action");
    return contractInterface.encodeFunctionData(method, [productCode]);
};

const parseLifecycleEvent = (receipt, { productCode, contractAddress = CONTRACT_ADDRESS } = {}) => {
    if (!receipt || !productCode || !contractAddress) return null;
    const fragment = contractInterface.getEvent("ProductLifecycleEvent");
    const expectedTopic = ethers.keccak256(ethers.toUtf8Bytes(String(productCode))).toLowerCase();
    for (const log of receipt.logs || []) {
        if (
            String(log.address).toLowerCase() !== String(contractAddress).toLowerCase() ||
            log.topics?.[0]?.toLowerCase() !== fragment.topicHash.toLowerCase() ||
            log.topics?.[1]?.toLowerCase() !== expectedTopic
        ) continue;
        try {
            const parsed = contractInterface.parseLog(log);
            if (parsed?.name !== "ProductLifecycleEvent") continue;
            return {
                productCode: String(productCode),
                productIdTopic: expectedTopic,
                actor: parsed.args.actor,
                counterparty: parsed.args.counterparty,
                previousState: Number(parsed.args.previousState),
                newState: Number(parsed.args.newState),
                custodian: parsed.args.custodian,
                timestamp: Number(parsed.args.timestamp),
                logIndex: Number(log.index ?? log.logIndex),
                transactionHash: log.transactionHash || null,
                blockNumber: log.blockNumber === undefined ? null : Number(log.blockNumber)
            };
        } catch {
            // Ignore logs that do not match the V2 lifecycle event.
        }
    }
    return null;
};

const getLifecycleEventsInBlock = async (productCode, blockNumber, registryAddress = CONTRACT_ADDRESS) => {
    await assertSepolia(registryAddress);
    const instance = getContract(registryAddress);
    const logs = await instance.queryFilter(
        instance.filters.ProductLifecycleEvent(productCode),
        blockNumber,
        blockNumber
    );
    return logs
        .map((log) => parseLifecycleEvent({ logs: [log] }, { productCode, contractAddress: registryAddress }))
        .filter(Boolean);
};

const getAdminAddress = async (registryAddress = CONTRACT_ADDRESS) => {
    await assertSepolia(registryAddress);
    return ethers.getAddress(await getContract(registryAddress).admin());
};

module.exports = {
    REGISTRY_VERSION,
    SEPOLIA_CHAIN_ID: Number(SEPOLIA_CHAIN_ID),
    ROLE,
    CONTRACT_ADDRESS,
    contractInterface,
    LIFECYCLE_METHODS,
    assertSepolia,
    getRole,
    prepareMintTransaction,
    encodeMintProductData,
    waitForMintTransaction,
    parseProductMintedEvent,
    getMintEvent,
    getProduct,
    getProductFromBlockchain,
    verifyProductOnBlockchain,
    encodeLifecycleTransaction,
    parseLifecycleEvent,
    getLifecycleEventsInBlock,
    getAdminAddress,
    getContract
};
