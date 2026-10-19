const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name;
  const chainId = network.config.chainId;

  console.log("Deploying ProductRegistry...");
  console.log("Network:", networkName);
  console.log("Chain ID:", chainId);
  console.log("Deploying with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "\n");

  const ProductRegistry = await ethers.getContractFactory("ProductRegistry");
  const contract = await ProductRegistry.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();

  // Set explorer based on network
  let explorer = "";
  if (chainId === 80002) {
    explorer = `https://amoy.polygonscan.com/address/${address}`;
  } else if (chainId === 11155111) {
    explorer = `https://sepolia.etherscan.io/address/${address}`;
  } else {
    explorer = `http://localhost/${address}`;
  }

  console.log("✅ ProductRegistry deployed!");
  console.log("Contract Address:", address);
  console.log("Explorer:", explorer);

  // Save deployment info
  const deployInfo = {
    contractAddress: address,
    deployer:        deployer.address,
    network:         networkName,
    chainId:         chainId,
    explorer:        explorer,
    deployedAt:      new Date().toISOString(),
    abi:             JSON.parse(contract.interface.formatJson()),
  };

  const dir = path.join(__dirname, "../artifacts");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(
    path.join(dir, "ProductRegistry.json"),
    JSON.stringify(deployInfo, null, 2)
  );

  console.log("\n--- Copy to backend .env ---");
  console.log(`CONTRACT_ADDRESS=${address}`);
  if (chainId === 80002) {
    console.log(`BLOCKCHAIN_RPC_URL=https://rpc-amoy.polygon.technology`);
    console.log(`CHAIN_ID=80002`);
  } else if (chainId === 11155111) {
    console.log(`BLOCKCHAIN_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com`);
    console.log(`CHAIN_ID=11155111`);
  }
  console.log("----------------------------");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });