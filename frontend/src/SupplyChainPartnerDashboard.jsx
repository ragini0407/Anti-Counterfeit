import React from "react";
import WalletBinding from "./WalletBinding";
import LifecycleWorkflow from "./LifecycleWorkflow";

function SupplyChainPartnerDashboard({ onLogout }) {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const partnerRole = user.role === "DISTRIBUTOR" ? "Distributor" : "Retailer";

  return (
    <main className="partner-workspace">
      <header className="partner-header">
        <div className="partner-heading">
          <span className="partner-eyebrow">SUPPLY CHAIN PORTAL</span>
          <h1>{partnerRole} workspace</h1>
          <p>Connect your verified Sepolia wallet to prepare your account for supply-chain operations.</p>
        </div>
        <button className="partner-logout" type="button" onClick={onLogout}>Log out</button>
      </header>
      <div className="partner-content">
        <WalletBinding />
        <section className="partner-notice" aria-label="Account approval information">
          <span className="partner-notice-icon" aria-hidden="true">i</span>
          <div>
            <h2>Account and contract approvals are separate</h2>
            <p>Admin approval updates your application account. The smart contract must also report the matching wallet role before the manufacturer can select this partner.</p>
          </div>
        </section>
        <LifecycleWorkflow role={user.role} compact />
      </div>
    </main>
  );
}

export default SupplyChainPartnerDashboard;
