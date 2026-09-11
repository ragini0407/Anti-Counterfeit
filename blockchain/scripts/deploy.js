const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying ProductRegistry...");
  console.log("Deploying with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "MATIC\n");

  const ProductRegistry = await ethers.getContractFactory("ProductRegistry");
  const contract = await ProductRegistry.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();

  console.log("✅ ProductRegistry deployed!");
  console.log("Contract Address:", address);
  console.log(`Explorer: https://amoy.polygonscan.com/address/${address}\n`);

  // Save deployment info
  const deployInfo = {
    contractAddress: address,
    deployer:        deployer.address,
    network:         "Polygon Amoy Testnet",
    chainId:         80002,
    explorer:        `https://amoy.polygonscan.com/address/${address}`,
    deployedAt:      new Date().toISOString(),
    abi:             JSON.parse(contract.interface.formatJson()),
  };

  const dir = path.join(__dirname, "../artifacts");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(
    path.join(dir, "ProductRegistry.json"),
    JSON.stringify(deployInfo, null, 2)
  );

  console.log("--- Copy to backend .env ---");
  console.log(`CONTRACT_ADDRESS=${address}`);
  console.log(`BLOCKCHAIN_RPC_URL=https://rpc-amoy.polygon.technology`);
  console.log(`CHAIN_ID=80002`);
  console.log("----------------------------");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });