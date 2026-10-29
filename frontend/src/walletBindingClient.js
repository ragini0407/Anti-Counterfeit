const SEPOLIA_CHAIN_ID = 11155111;

export const connectBoundWallet = async ({ ethereum, boundAddress, onAccount, onNetwork }) => {
  if (!ethereum?.request) {
    throw new Error("MetaMask was not found in this browser.");
  }

  const accounts = await ethereum.request({ method: "eth_requestAccounts" });
  const address = accounts?.[0];
  if (!address) throw new Error("Select a MetaMask account to continue.");
  onAccount?.(address);

  const chainId = Number.parseInt(await ethereum.request({ method: "eth_chainId" }), 16);
  const isSepolia = chainId === SEPOLIA_CHAIN_ID;
  onNetwork?.(isSepolia ? "Ethereum Sepolia" : `Wrong network (chain ${chainId})`);

  const addressMatches = Boolean(boundAddress) &&
    address.toLowerCase() === boundAddress.toLowerCase();

  if (!addressMatches && !isSepolia) {
    throw new Error(`Connected account does not match the saved wallet binding, and MetaMask is on chain ${chainId}. The saved binding was not changed.`);
  }
  if (!addressMatches) {
    throw new Error("Connected MetaMask account does not match the saved wallet binding. The saved binding was not changed.");
  }
  if (!isSepolia) {
    throw new Error(`Switch MetaMask to Ethereum Sepolia (chain ${SEPOLIA_CHAIN_ID}). The saved binding was not changed.`);
  }

  return { address, chainId };
};
