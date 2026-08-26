# Blockchain Integration Guide
## For Backend Developer (Team Member 1)

## Network
- RPC URL: http://127.0.0.1:8545
- Chain ID: 31337
- Start node: npx hardhat node (keep running)

## Contract
- Name: ProductRegistry
- Address: 0x... (paste deployed address here)
- ABI location: blockchain/artifacts/contracts/ProductRegistry.sol/ProductRegistry.json

## Contract Functions

### 1. approveManufacturer(address)
Admin approves a manufacturer wallet address before they can register products.

### 2. registerProduct(productId, manufacturer, productHash, timestamp)
Only approved manufacturers can call this.
- productId: string e.g. "PROD-2026-ABC"
- manufacturer: string e.g. "MFR-0001"
- productHash: SHA256 hash of product data
- timestamp: Math.floor(Date.now() / 1000)

### 3. getProduct(productId)
Returns full product details.
Returns: (productId, manufacturer, productHash, timestamp, exists, isFlagged)

### 4. verifyProduct(productId, hashToCheck)
Returns: (exists, hashMatches)

### 5. flagProduct(productId)
Admin flags a counterfeit product.

## backend .env variables required
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
CONTRACT_ADDRESS=0x... (from deploy output)
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

## ethers.js v6 example
const { ethers } = require('ethers');
const artifact = require('./artifacts/contracts/ProductRegistry.sol/ProductRegistry.json');

const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
const signer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, artifact.abi, signer);

// Register product
await contract.registerProduct(productId, manufacturerId, productHash, timestamp);

// Verify product
const [exists, hashMatches] = await contract.verifyProduct(productId, hash);