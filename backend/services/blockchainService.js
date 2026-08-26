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

// Admin wallet
const adminSigner = new ethers.Wallet(
    process.env.DEPLOYER_PRIVATE_KEY,
    provider
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

const registerProductOnBlockchain = async ({
    productCode,
    productName,
    category,
    brandName,
    batchNumber,
    manufacturingDate,
    manufacturer
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
        productHash
    );

    const receipt = await tx.wait();

    return {
        productHash,
        transactionHash: receipt.hash,
        manufacturerWallet: manufacturerWallet.address
    };
};

const verifyProductOnBlockchain = async (
    productCode,
    hashToCheck
) => {

    const contract = new ethers.Contract(
        process.env.CONTRACT_ADDRESS,
        artifact.abi,
        provider
    );

    const [exists, hashMatches, isFlagged] =
        await contract.verifyProduct(
            productCode,
            hashToCheck
        );

    return {
        exists,
        hashMatches,
        isFlagged
    };
};

module.exports = {
    createProductHash,
    registerProductOnBlockchain,
    verifyProductOnBlockchain
};