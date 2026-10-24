const { ethers } = require("hardhat");

const CONTRACT_ADDRESS         = "0xa3d897002aAFec974D1AF13039756CaC19c41ECD";
const MANUFACTURER_PRIVATE_KEY = "0x5fd4fb0434250c27c168f9dce19f9ff999c620f2383c830b5bee0017e31a2a1c";
const MANUFACTURER_ADDRESS     = "0xbfa9ffD39BC7F84ad58aF568332189710E0E9034";
const DISTRIBUTOR_PRIVATE_KEY  = "0x49ec284d88e2598ca286cccfb858d2644034c15027e017261b40095b18e03adb";
const DISTRIBUTOR_ADDRESS      = "0x25eC10Eb485bcCB3DF793dB4e12D4d6f85036923";
const RETAILER_PRIVATE_KEY     = "0xe6c8eec3af6af66bcc385f76b806a23dc39bba49e5e1c63ecafd0d3e349b2bed";
const RETAILER_ADDRESS         = "0xbc69C72e412D39Dfe1B69105F56f5BF7c55271Ca";

async function setupRole(contract, admin, walletKey, walletAddress, roleNumber, roleName) {
  console.log(`\n--- Setting up ${roleName} ---`);
  console.log(`Address: ${walletAddress}`);

  const wallet = new ethers.Wallet(walletKey, ethers.provider);
  const existingRole = await contract.getRole(walletAddress);

  if (existingRole.toString() === roleNumber.toString()) {
    console.log(`${roleName} already approved! ✅`);
    return;
  }

  console.log(`Step 1: ${roleName} requesting role...`);
  const tx1 = await contract
    .connect(wallet)
    .requestRole(roleNumber, `${roleName} Company`);
  await tx1.wait();
  console.log("Requested! TxHash:", tx1.hash);

  console.log(`Step 2: Admin approving ${roleName}...`);
  const tx2 = await contract
    .connect(admin)
    .approveRole(walletAddress);
  await tx2.wait();
  console.log("Approved! TxHash:", tx2.hash);

  const newRole = await contract.getRole(walletAddress);
  console.log(`Role confirmed: ${newRole.toString()} ✅`);
}

async function main() {
  console.log("Setting up all roles on blockchain...\n");

  const [admin] = await ethers.getSigners();
  console.log("Admin:   ", admin.address);
  console.log("Contract:", CONTRACT_ADDRESS);

  const ProductRegistry = await ethers.getContractFactory("ProductRegistry");
  const contract = ProductRegistry.attach(CONTRACT_ADDRESS);

  // Setup Manufacturer
  await setupRole(
    contract, admin,
    MANUFACTURER_PRIVATE_KEY,
    MANUFACTURER_ADDRESS,
    1, "Manufacturer"
  );

  // Setup Distributor
  await setupRole(
    contract, admin,
    DISTRIBUTOR_PRIVATE_KEY,
    DISTRIBUTOR_ADDRESS,
    2, "Distributor"
  );

  // Setup Retailer
  await setupRole(
    contract, admin,
    RETAILER_PRIVATE_KEY,
    RETAILER_ADDRESS,
    3, "Retailer"
  );

  console.log("\n=== ALL ROLES SETUP COMPLETE ===");
  console.log("Admin:       ", admin.address);
  console.log("Manufacturer:", MANUFACTURER_ADDRESS);
  console.log("Distributor: ", DISTRIBUTOR_ADDRESS);
  console.log("Retailer:    ", RETAILER_ADDRESS);
  console.log("Contract:    ", CONTRACT_ADDRESS);
  console.log("Network:      Ethereum Sepolia");
  console.log("\nShare with backend teammate:");
  console.log("MANUFACTURER_ADDRESS =", MANUFACTURER_ADDRESS);
  console.log("DISTRIBUTOR_ADDRESS  =", DISTRIBUTOR_ADDRESS);
  console.log("RETAILER_ADDRESS     =", RETAILER_ADDRESS);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });