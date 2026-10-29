import React, { useCallback, useEffect, useState } from "react";
import { apiUrl } from "./api";
import { connectBoundWallet } from "./walletBindingClient";
const SEPOLIA_CHAIN_ID = 11155111;

function toHexMessage(message) {
  const bytes = new TextEncoder().encode(message);
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function WalletBinding({ onBound }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [walletAccount, setWalletAccount] = useState("");
  const [network, setNetwork] = useState("");
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  });
  const [password, setPassword] = useState("");

  const refreshWalletStatus = useCallback(async () => {
    if (!window.ethereum) {
      setWalletAccount("");
      setNetwork("MetaMask unavailable");
      return;
    }

    try {
      const [accounts, chainId] = await Promise.all([
        window.ethereum.request({ method: "eth_accounts" }),
        window.ethereum.request({ method: "eth_chainId" })
      ]);
      setWalletAccount(accounts?.[0] || "");
      const parsedChainId = Number.parseInt(chainId, 16);
      setNetwork(parsedChainId === SEPOLIA_CHAIN_ID ? "Ethereum Sepolia" : `Wrong network (chain ${parsedChainId})`);
    } catch {
      setNetwork("Unable to read wallet status");
    }
  }, []);

  useEffect(() => {
    const statusTimer = window.setTimeout(refreshWalletStatus, 0);
    if (!window.ethereum?.on) return () => window.clearTimeout(statusTimer);
    window.ethereum.on("accountsChanged", refreshWalletStatus);
    window.ethereum.on("chainChanged", refreshWalletStatus);
    return () => {
      window.clearTimeout(statusTimer);
      window.ethereum.removeListener?.("accountsChanged", refreshWalletStatus);
      window.ethereum.removeListener?.("chainChanged", refreshWalletStatus);
    };
  }, [refreshWalletStatus]);

  const bindWallet = async ({ rebind = false } = {}) => {
    setBusy(true);
    setMessage("");
    try {
      if (!window.ethereum) {
        throw new Error("MetaMask was not found in this browser.");
      }

      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const address = accounts?.[0];
      if (!address) throw new Error("Select a MetaMask account to continue.");
      setWalletAccount(address);

      const chainId = Number.parseInt(
        await window.ethereum.request({ method: "eth_chainId" }),
        16
      );
      if (chainId !== SEPOLIA_CHAIN_ID) {
        setNetwork(`Wrong network (chain ${chainId})`);
        throw new Error("Switch MetaMask to Ethereum Sepolia before binding your wallet.");
      }
      setNetwork("Ethereum Sepolia");

      const token = localStorage.getItem("token");
      const challengeResponse = await fetch(apiUrl(rebind ? "/auth/wallet/rebind/challenge" : "/auth/wallet/challenge"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(rebind ? { address, password } : { address })
      });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok) throw new Error(challenge.message || "Could not create wallet challenge.");

      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [toHexMessage(challenge.message), address]
      });

      const confirmResponse = await fetch(apiUrl(rebind ? "/auth/wallet/rebind/confirm" : "/auth/wallet/confirm"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ address, signature })
      });
      const result = await confirmResponse.json();
      if (!confirmResponse.ok) throw new Error(result.message || "Wallet binding failed.");

      const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
      const updatedUser = {
        ...currentUser,
        walletAddress: result.walletAddress,
        walletVerifiedAt: new Date().toISOString()
      };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setUser(updatedUser);
      setPassword("");
      setMessage(rebind ? "Wallet rebound successfully." : `Wallet bound successfully: ${result.walletAddress}`);
      onBound?.(result.walletAddress);
    } catch (error) {
      setMessage(error.message || "Wallet binding failed.");
    } finally {
      setBusy(false);
    }
  };

  const connectBoundWalletOnly = async () => {
    setBusy(true);
    setMessage("");
    try {
      const { address } = await connectBoundWallet({
        ethereum: window.ethereum,
        boundAddress: user.walletAddress,
        onAccount: setWalletAccount,
        onNetwork: setNetwork
      });
      setMessage(`MetaMask connected to the bound wallet on Sepolia: ${address}`);
    } catch (error) {
      setMessage(error.message || "MetaMask connection failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="wallet-card">
      <div className="wallet-card-heading">
        <div>
          <span className="partner-eyebrow">WALLET SECURITY</span>
          <h2>Sepolia wallet</h2>
        </div>
        <span className="wallet-network-chip">Sepolia · 11155111</span>
      </div>
      <div className="wallet-status-grid">
        <div className="wallet-status-item">
          <span>MetaMask account</span>
          <strong>{walletAccount ? `${walletAccount.slice(0, 6)}…${walletAccount.slice(-4)}` : window.ethereum ? "Not connected" : "Not detected"}</strong>
        </div>
        <div className="wallet-status-item">
          <span>Network</span>
          <strong className={network === "Ethereum Sepolia" ? "is-connected" : ""}>{network || "Checking wallet…"}</strong>
        </div>
      </div>
      {user.walletAddress ? (
        <>
          <div className={`wallet-bound-state ${walletAccount && walletAccount.toLowerCase() !== user.walletAddress.toLowerCase() ? "wallet-mismatch" : ""}`}>
            <span className="wallet-check" aria-hidden="true">✓</span>
            <div>
              <strong>{walletAccount && walletAccount.toLowerCase() !== user.walletAddress.toLowerCase() ? "A different MetaMask account is active" : "Wallet binding verified"}</strong>
              <p>{user.walletAddress}</p>
            </div>
          </div>
          <div className="wallet-bind-action">
            {!walletAccount && (
              <button
                type="button"
                className="wallet-connect-button"
                onClick={connectBoundWalletOnly}
                disabled={busy}
              >
                {busy ? "Connecting MetaMask…" : "Connect MetaMask"}
              </button>
            )}
            <p>To replace this binding, confirm your account password and sign a fresh challenge with the new wallet in MetaMask.</p>
            <label htmlFor="wallet-rebind-password">Account password</label>
            <input
              id="wallet-rebind-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
            />
            <button
              type="button"
              className="wallet-connect-button"
              onClick={() => bindWallet({ rebind: true })}
              disabled={busy || !password}
            >
              {busy ? "Waiting for MetaMask…" : "Replace bound wallet"}
            </button>
          </div>
        </>
      ) : (
        <div className="wallet-bind-action">
          <p>Bind a wallet you control. MetaMask signs a one-time message; this app does not receive your private key or send a blockchain transaction for binding.</p>
          <button type="button" className="wallet-connect-button" onClick={bindWallet} disabled={busy}>
            {busy ? "Waiting for MetaMask…" : walletAccount ? "Verify connected wallet" : "Connect MetaMask"}
          </button>
        </div>
      )}
      {message && <p className="wallet-feedback" role="status">{message}</p>}
    </section>
  );
}

export default WalletBinding;
