const { ethers } = require("ethers");
const crypto = require("crypto");
const path = require("path");

const artifact = require(
    path.join(
        __dirname,
        "../../blockchain/artifacts/contracts/ProductRegistry.sol/ProductRegistry.json"
    )
);

const provider = new ethers.JsonRpcProvider(
    process.env.BLOCKCHAIN_RPC_URL
);

const createProductHash = ({
    productCode,
    productName,
    category,
    brandName,
    batchNumber,
    manufacturingDate,
    manufacturer
}) => {
    const data = [
        productCode,
        productName,
        category,
        brandName,
        batchNumber,
        manufacturingDate,
        manufacturer
    ].join("|");

    return crypto
        .createHash("sha256")
        .update(data)
        .digest("hex");
};

const createImageHash = (imageBuffer) => {
    return crypto
        .createHash("sha256")
        .update(imageBuffer)
        .digest("hex");
};

const createQRHash = (qrData) => {
    return crypto
        .createHash("sha256")
        .update(qrData)
        .digest("hex");
};

const registerProductOnBlockchain = async ({
    productCode,
    productName,
    category,
    brandName,
    batchNumber,
    manufacturingDate,
    manufacturer,
    imageBuffer,
    qrData
}) => {

    const productHash = createProductHash({
        productCode,
        productName,
        category,
        brandName,
        batchNumber,
        manufacturingDate,
        manufacturer
    });

    const imageHash = createImageHash(imageBuffer);

    const qrHash = createQRHash(qrData);

    // Prototype manufacturer wallet
    const manufacturerWallet = new ethers.Wallet(
        process.env.MANUFACTURER_PRIVATE_KEY,
        provider
    );

    const contract = new ethers.Contract(
        process.env.CONTRACT_ADDRESS,
        artifact.abi,
        manufacturerWallet
    );

    const tx = await contract.registerProduct(
        productCode,
        productName,
        category,
        brandName,
        batchNumber,
        manufacturingDate,
        productHash,
        imageHash,
        qrHash
    );

    const receipt = await tx.wait();

    return {
        productHash,
        imageHash,
        qrHash,
        transactionHash: receipt.hash,
        manufacturerWallet: manufacturerWallet.address
    };
};

const getProductFromBlockchain = async (productCode) => {

    const contract = new ethers.Contract(
        process.env.CONTRACT_ADDRESS,
        artifact.abi,
        provider
    );

    const product = await contract.getProduct(productCode);

    return {
        productId: product.productId,
        productName: product.productName,
        category: product.category,
        brandName: product.brandName,
        batchNumber: product.batchNumber,
        manufacturingDate: product.manufacturingDate,
        manufacturer: product.manufacturer,
        productHash: product.productHash,
        imageHash: product.imageHash,
        qrHash: product.qrHash,
        timestamp: product.timestamp,
        status: Number(product.status)
    };
};

const verifyProductOnBlockchain = async (productCode) => {

    const contract = new ethers.Contract(
        process.env.CONTRACT_ADDRESS,
        artifact.abi,
        provider
    );

    const result = await contract.verifyProduct(productCode);

    return {
        exists: result[0],
        isActive: result[1],
        isFlagged: result[2],
        imageHash: result[3],
        qrHash: result[4]
    };
};

const getManufacturerProducts = async (manufacturerAddress) => {

    const contract = new ethers.Contract(
        process.env.CONTRACT_ADDRESS,
        artifact.abi,
        provider
    );

    return await contract.getManufacturerProducts(
        manufacturerAddress
    );
};

const deactivateProductOnBlockchain = async (productCode) => {

    const manufacturerWallet = new ethers.Wallet(
        process.env.MANUFACTURER_PRIVATE_KEY,
        provider
    );

    const contract = new ethers.Contract(
        process.env.CONTRACT_ADDRESS,
        artifact.abi,
        manufacturerWallet
    );

    const tx = await contract.deactivateProduct(productCode);

    const receipt = await tx.wait();

    return {
        transactionHash: receipt.hash
    };
};

module.exports = {
    createProductHash,
    createImageHash,
    createQRHash,
    registerProductOnBlockchain,
    getProductFromBlockchain,
    verifyProductOnBlockchain,
    getManufacturerProducts,
    deactivateProductOnBlockchain
};