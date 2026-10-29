import test from "node:test";
import assert from "node:assert/strict";
import { connectBoundWallet } from "../src/walletBindingClient.js";

const boundAddress = "0x1111111111111111111111111111111111111111";

const makeEthereum = ({ address = boundAddress, chainId = "0xaa36a7" } = {}) => {
  const calls = [];
  return {
    calls,
    request: async ({ method }) => {
      calls.push(method);
      if (method === "eth_requestAccounts") return [address];
      if (method === "eth_chainId") return chainId;
      throw new Error(`Unexpected wallet request: ${method}`);
    }
  };
};

test("connection-only flow connects the already-bound wallet on Sepolia without signing or rebinding", async () => {
  const ethereum = makeEthereum();
  const updates = {};
  const result = await connectBoundWallet({
    ethereum,
    boundAddress: boundAddress.toUpperCase().replace("0X", "0x"),
    onAccount: (address) => { updates.address = address; },
    onNetwork: (network) => { updates.network = network; }
  });

  assert.deepEqual(result, { address: boundAddress, chainId: 11155111 });
  assert.deepEqual(ethereum.calls, ["eth_requestAccounts", "eth_chainId"]);
  assert.deepEqual(updates, { address: boundAddress, network: "Ethereum Sepolia" });
});

test("a different connected wallet is warned about without changing the saved binding", async () => {
  const otherAddress = "0x2222222222222222222222222222222222222222";
  const ethereum = makeEthereum({ address: otherAddress });
  const updates = {};

  await assert.rejects(connectBoundWallet({
    ethereum,
    boundAddress,
    onAccount: (address) => { updates.address = address; },
    onNetwork: (network) => { updates.network = network; }
  }), /does not match the saved wallet binding.*binding was not changed/i);

  assert.equal(boundAddress, "0x1111111111111111111111111111111111111111");
  assert.deepEqual(updates, { address: otherAddress, network: "Ethereum Sepolia" });
  assert.deepEqual(ethereum.calls, ["eth_requestAccounts", "eth_chainId"]);
});

test("the bound wallet on a non-Sepolia network is rejected", async () => {
  const ethereum = makeEthereum({ chainId: "0x1" });
  const updates = {};

  await assert.rejects(connectBoundWallet({
    ethereum,
    boundAddress,
    onAccount: (address) => { updates.address = address; },
    onNetwork: (network) => { updates.network = network; }
  }), /Switch MetaMask to Ethereum Sepolia/i);

  assert.deepEqual(updates, { address: boundAddress, network: "Wrong network (chain 1)" });
  assert.deepEqual(ethereum.calls, ["eth_requestAccounts", "eth_chainId"]);
});
