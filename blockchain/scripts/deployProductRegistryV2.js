const { ethers, network } = require("hardhat");

async function main() {
  if (network.name !== "sepolia") {
    throw new Error("ProductRegistry V2 deployment is permitted only with the explicit sepolia Hardhat network.");
  }
  const chain = await ethers.provider.getNetwork();
  if (chain.chainId !== 11155111n) {
    throw new Error("Refusing ProductRegistry V2 deployment: provider is not Ethereum Sepolia (11155111).");
  }

  const [deployer] = await ethers.getSigners();
  const Registry = await ethers.getContractFactory("ProductRegistryV2");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  console.log("ProductRegistry V2 deployment confirmed.");
  console.log(`Chain ID: ${chain.chainId}`);
  console.log(`Registry address: ${address}`);
  console.log(`Admin address: ${deployer.address}`);
  console.log("Set PRODUCT_REGISTRY_V2_ADDRESS in the backend runtime configuration only after reviewing this deployment.");
}

main().catch((error) => {
  console.error(error.message || "V2 deployment failed");
  process.exitCode = 1;
});
