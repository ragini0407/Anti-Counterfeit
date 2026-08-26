const hre = require("hardhat");

async function main() {
  console.log("Deploying ProductRegistry...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const ProductRegistry = await hre.ethers.getContractFactory("ProductRegistry");
  const registry = await ProductRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("ProductRegistry deployed to:", address);
  console.log("Network:", hre.network.name);
  console.log("Admin address:", deployer.address);

  console.log("\n--- Save this info for the backend developer ---");
  console.log("CONTRACT_ADDRESS=" + address);
  console.log("NETWORK=" + hre.network.name);
  console.log("--------------------------------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
