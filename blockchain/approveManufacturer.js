const hre = require("hardhat");

async function main() {
    const contractAddress = process.env.CONTRACT_ADDRESS;

    const [admin, manufacturer] = await hre.ethers.getSigners();

    console.log("Admin:", admin.address);
    console.log("Manufacturer:", manufacturer.address);

    const ProductRegistry = await hre.ethers.getContractFactory(
        "ProductRegistry"
    );

    const contract = ProductRegistry.attach(contractAddress);

    console.log("Approving manufacturer...");

    const tx = await contract.approveManufacturer(
        manufacturer.address
    );

    await tx.wait();

    console.log("Manufacturer approved:", manufacturer.address);
    console.log("Transaction:", tx.hash);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});