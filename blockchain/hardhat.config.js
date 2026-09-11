require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.19",
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
  url: process.env.SEPOLIA_RPC_URL ||
       "https://ethereum-sepolia-rpc.publicnode.com",
  chainId: 11155111,
  accounts: [process.env.DEPLOYER_PRIVATE_KEY],
  timeout: 120000,
},
  },
};