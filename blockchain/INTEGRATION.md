# Blockchain Integration Guide
## Legacy V1 deployment: Polygon Amoy (chain 80002)

This legacy V1 deployment is not the registry currently configured for backend reads. The backend's last verified configuration used Ethereum Sepolia (chain 11155111) and V1 address `0xa3d897002aAFec974D1AF13039756CaC19c41ECD`. ProductRegistry V2 is a separate, not-yet-deployed contract. See [ProductRegistry V2](./PRODUCT_REGISTRY_V2.md) for its lifecycle, compatibility, tests, and approval-gated deployment checklist.

## Contract Details
- Address: 0x96BfBfDEEa222449675C1320355550C18c89dDa5
- Explorer: https://amoy.polygonscan.com/address/0x96BfBfDEEa222449675C1320355550C18c89dDa5
- Network: Polygon Amoy
- Chain ID: 80002
- RPC URL: https://rpc-amoy.polygon.technology

## Legacy V1 environment example (Polygon Amoy only; not backend active configuration)
CONTRACT_ADDRESS=0x96BfBfDEEa222449675C1320355550C18c89dDa5
BLOCKCHAIN_RPC_URL=https://rpc-amoy.polygon.technology
CHAIN_ID=80002
# Do not store or commit private keys; use a secure local secret manager.
