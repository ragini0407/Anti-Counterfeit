import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  confirmLifecycleOperation,
  fetchLifecycleProducts,
  releaseLifecycleSubmission,
  resumeLifecycleSubmission,
  submitLifecycleAction
} from "./lifecycleClient";

const stateActions = {
  MANUFACTURER: { MINTED: ["DISPATCH_TO_DISTRIBUTOR", "Dispatch to distributor"] },
  DISTRIBUTOR: {
    DISPATCHED_TO_DISTRIBUTOR: ["RECEIVE_BY_DISTRIBUTOR", "Confirm receipt"],
    RECEIVED_BY_DISTRIBUTOR: ["DISPATCH_TO_RETAILER", "Dispatch to retailer"]
  },
  RETAILER: {
    DISPATCHED_TO_RETAILER: ["RECEIVE_BY_RETAILER", "Confirm receipt"],
    RECEIVED_BY_RETAILER: ["RECORD_SALE", "Record retailer-reported sale"]
  }
};

const readUser = () => {
  try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; }
};

function LifecycleWorkflow({ role, compact = false }) {
  const [entries, setEntries] = useState([]);
  const [pendingActions, setPendingActions] = useState([]);
  const [failedActions, setFailedActions] = useState([]);
  const [reviewRequiredActions, setReviewRequiredActions] = useState([]);
  const [recoveryHashes, setRecoveryHashes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyCode, setBusyCode] = useState("");
  const user = useMemo(() => readUser(), []);
  const token = localStorage.getItem("token");
  const pendingStorageKey = `lifecyclePending:${user.id || "unbound"}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchLifecycleProducts(token);
      setEntries(Array.isArray(data.products) ? data.products : []);
      setPendingActions(Array.isArray(data.pendingActions) ? data.pendingActions : []);
      setFailedActions(Array.isArray(data.failedActions) ? data.failedActions : []);
      setReviewRequiredActions(Array.isArray(data.reviewRequiredActions) ? data.reviewRequiredActions : []);
    } catch (loadError) {
      setError(loadError.message || "Lifecycle data is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const loadInitialData = async () => {
      try {
        const data = await fetchLifecycleProducts(token);
        if (cancelled) return;
        setEntries(Array.isArray(data.products) ? data.products : []);
        setPendingActions(Array.isArray(data.pendingActions) ? data.pendingActions : []);
        setFailedActions(Array.isArray(data.failedActions) ? data.failedActions : []);
        setReviewRequiredActions(Array.isArray(data.reviewRequiredActions) ? data.reviewRequiredActions : []);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Lifecycle data is temporarily unavailable.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadInitialData();
    return () => { cancelled = true; };
  }, [token]);

  const [savedPending, setSavedPending] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(pendingStorageKey) || "{}"); } catch { return {}; }
  });

  const handleConfirmed = async (productCode) => {
    setNotice("The lifecycle transition is confirmed by Sepolia and recorded by the backend.");
    setError("");
    const updated = { ...savedPending };
    delete updated[productCode];
    setSavedPending(updated);
    sessionStorage.setItem(pendingStorageKey, JSON.stringify(updated));
    await load();
  };

  const clearSavedPending = (productCode) => {
    const updated = { ...savedPending };
    delete updated[productCode];
    setSavedPending(updated);
    sessionStorage.setItem(pendingStorageKey, JSON.stringify(updated));
  };

  const handleFailed = async (productCode) => {
    clearSavedPending(productCode);
    setNotice("Sepolia confirms the transaction reverted. The product state did not advance. Review the failed transaction before manually starting another attempt.");
    setError("");
    await load();
  };

  const savePending = (productCode, pending) => {
    const updated = { ...savedPending, [productCode]: { ...(savedPending[productCode] || {}), ...pending } };
    setSavedPending(updated);
    sessionStorage.setItem(pendingStorageKey, JSON.stringify(updated));
  };

  const recoverSubmittedHash = async (entry) => {
    const productCode = entry.product.productCode;
    const operation = pendingActions.find((item) => item.productCode === productCode && ["PREPARED", "SUBMITTING"].includes(item.status))
      || reviewRequiredActions.find((item) => item.productCode === productCode && item.reviewReason === "LEGACY_REVERTED_CANDIDATE");
    const transactionHash = String(recoveryHashes[productCode] || "").trim();
    if (!operation || !/^0x[\da-fA-F]{64}$/.test(transactionHash)) {
      setError("Enter the transaction hash from MetaMask or the Sepolia explorer. Do not submit a new transaction.");
      return;
    }
    setBusyCode(productCode);
    setError("");
    try {
      savePending(productCode, { operationId: operation.operationId, transactionHash });
      const result = await confirmLifecycleOperation({ operationId: operation.operationId, transactionHash, submissionAttemptId: operation.submissionAttemptId, token });
      if (result.status === "FAILED") return handleFailed(productCode);
      if (result.status !== "CONFIRMED") throw new Error("The backend has not confirmed this transition.");
      await handleConfirmed(productCode);
    } catch (recoveryError) {
      if (recoveryError.reviewRequired) {
        savePending(productCode, { operationId: operation.operationId, transactionHash });
        if (recoveryError.operation?.reviewReason === "LEGACY_REVERTED_CANDIDATE") {
          setNotice("This legacy transaction reverted. The original operation is retained; if another transaction was already submitted for it, enter that existing hash to reconcile. Do not submit another transaction.");
          setError("");
          return;
        }
        setNotice("Transaction evidence requires administrator review. It is not confirmed; no new transaction can be started for this product.");
      }
      setError(recoveryError.message || "Could not reconcile the submitted transaction.");
    } finally {
      setBusyCode("");
      await load();
    }
  };

  const runAction = async (entry) => {
    const productCode = entry.product.productCode;
    setBusyCode(productCode);
    setError("");
    setNotice("");
    try {
      const saved = savedPending[productCode];
      if (saved?.stage === "CLAIM_UNKNOWN") {
        const resumed = await resumeLifecycleSubmission({
          operationId: saved.operationId,
          submissionAttemptId: saved.submissionAttemptId,
          token,
          ethereum: window.ethereum,
          onSubmitted: (submission) => savePending(productCode, submission)
        });
        if (resumed.status === "CONFIRMED") await handleConfirmed(productCode);
        return;
      }
      if (saved?.stage === "RELEASE_PENDING") {
        await releaseLifecycleSubmission({
          operationId: saved.operationId,
          submissionAttemptId: saved.submissionAttemptId,
          token
        });
        clearSavedPending(productCode);
      }

      const pending = savedPending[productCode] || pendingActions.find((item) => item.productCode === productCode);
      if (pending?.transactionHash) {
        const operation = await confirmLifecycleOperation({
          operationId: pending.operationId,
          transactionHash: pending.transactionHash,
          submissionAttemptId: pending.submissionAttemptId,
          token
        });
        if (operation.status === "FAILED") {
          await handleFailed(productCode);
          return;
        }
        if (operation.status !== "CONFIRMED") throw new Error("The backend has not confirmed this transition yet.");
        await handleConfirmed(productCode);
        return;
      }
      if (pending?.status === "SUBMITTING") {
        setNotice("This operation is reserved for reconciliation. Enter its transaction hash below; no new wallet transaction will be submitted.");
        return;
      }

      const [action] = stateActions[role]?.[entry.lifecycleState] || [];
      if (!action) return;
      const operation = await submitLifecycleAction({
        productCode,
        action,
        token,
        ethereum: window.ethereum,
        onSubmitted: (submission) => savePending(productCode, submission)
      });
      if (operation.status === "FAILED") {
        await handleFailed(productCode);
        return;
      }
      if (operation.status !== "CONFIRMED") throw new Error("The backend has not confirmed this transition yet.");
      await handleConfirmed(productCode);
    } catch (actionError) {
      if (actionError.transactionFailed) {
        await handleFailed(productCode);
      } else if (actionError.walletRejected) {
        clearSavedPending(productCode);
        setNotice("The wallet rejected the request. No transaction was submitted; the same operation may be retried.");
      } else if ((actionError.claimUnknown || actionError.claimReleasePending) && actionError.operationId && actionError.submissionAttemptId) {
        const stage = actionError.claimUnknown ? "CLAIM_UNKNOWN" : "RELEASE_PENDING";
        savePending(productCode, { operationId: actionError.operationId, submissionAttemptId: actionError.submissionAttemptId, stage });
        setNotice(actionError.claimUnknown
          ? "The reservation response was interrupted. Resume this same operation; no wallet transaction was requested yet."
          : "The wallet request was rejected, but releasing its reservation is pending. Retry the same operation before continuing.");
      } else if (actionError.submissionUnknown && actionError.operationId && actionError.submissionAttemptId) {
        savePending(productCode, { operationId: actionError.operationId, submissionAttemptId: actionError.submissionAttemptId, stage: "SUBMISSION_UNKNOWN" });
        setNotice("MetaMask did not return a transaction hash. Check wallet activity and reconcile it below. Do not send another transaction.");
      } else if (actionError.reviewRequired && actionError.operationId && actionError.transactionHash) {
        savePending(productCode, { operationId: actionError.operationId, transactionHash: actionError.transactionHash });
        setNotice("Transaction evidence requires administrator review. It is not marked confirmed.");
      } else if ((actionError.confirmationPending || actionError.confirmationUnavailable) && actionError.operationId && actionError.transactionHash) {
        savePending(productCode, { operationId: actionError.operationId, transactionHash: actionError.transactionHash });
        setNotice(actionError.confirmationUnavailable
          ? "The transaction hash is saved. Confirmation is unavailable right now; retrying will reuse this same hash."
          : "The transaction was submitted. Retry confirmation below; this will not submit another transaction.");
      } else if (actionError.confirmationRejected && actionError.operationId && actionError.transactionHash) {
        savePending(productCode, { operationId: actionError.operationId, transactionHash: actionError.transactionHash });
        setNotice("The backend rejected reconciliation. No success is recorded; keep this hash and request review before any new transaction.");
      }
      setError(actionError.message || "Could not complete the lifecycle transition.");
      await load();
    } finally {
      setBusyCode("");
    }
  };

  return (
    <section className={`lifecycle-panel${compact ? " lifecycle-panel-compact" : ""}`} aria-label="Product lifecycle" aria-live="polite">
      <header className="lifecycle-panel-header">
        <div>
          <span className="lifecycle-eyebrow">ON-CHAIN CUSTODY</span>
          <h2>Product lifecycle</h2>
          <p>Actions become complete only after Sepolia confirms the transaction and the backend verifies the resulting state.</p>
        </div>
        <button type="button" className="secondary-button lifecycle-refresh" onClick={load} disabled={loading}>Refresh</button>
      </header>

      {notice && <div className="lifecycle-notice" role="status">{notice}</div>}
      {error && <div className="lifecycle-error" role="alert">{error}</div>}
      {loading ? (
        <div className="lifecycle-state" role="status">Loading assigned products and current chain states…</div>
      ) : entries.length === 0 ? (
        <div className="lifecycle-state lifecycle-empty">
          <strong>No assigned product records are available.</strong>
          <span>This view uses saved product assignments and configured registry reads; it does not show sample products.</span>
        </div>
      ) : (
        <div className="lifecycle-list">
          {entries.map((entry) => {
            const product = entry.product;
            const action = stateActions[role]?.[entry.lifecycleState];
            const serverPending = pendingActions.find((item) => item.productCode === product.productCode);
            const pending = savedPending[product.productCode]?.transactionHash
              ? savedPending[product.productCode]
              : serverPending || savedPending[product.productCode];
            const lastFailure = failedActions.find((item) => item.productCode === product.productCode);
            const reviewRequired = reviewRequiredActions.find((item) => item.productCode === product.productCode);
            const legacyUnclaimed = serverPending?.status === "PREPARED" && serverPending.submissionProtocolVersion !== 2;
            const legacyRevertedRecovery = reviewRequired?.reviewReason === "LEGACY_REVERTED_CANDIDATE" && !reviewRequired.submissionAttemptId;
            const showRecoveryForm = legacyRevertedRecovery || serverPending?.status === "SUBMITTING" || legacyUnclaimed || pending?.stage === "SUBMISSION_UNKNOWN" || pending?.stage === "RELEASE_PENDING";
            return (
              <article className="lifecycle-product" key={product.productCode}>
                <div className="lifecycle-product-copy">
                  <span className="lifecycle-code">{product.productCode}</span>
                  <h3>{product.productName}</h3>
                  <p>{product.brandName || "Brand not recorded"} · {product.category || "Category not recorded"}</p>
                  {product.transactionHash && <small>Mint reference: {product.transactionHash.slice(0, 10)}…{product.transactionHash.slice(-8)}</small>}
                </div>
                <div className="lifecycle-product-state">
                  {entry.chainStatus === "AVAILABLE" ? (
                    <><span className="lifecycle-status">{entry.lifecycleState}</span><small>Current custodian {entry.currentCustodian ? `${entry.currentCustodian.slice(0, 8)}…${entry.currentCustodian.slice(-6)}` : "not available"}</small></>
                  ) : (
                    <><span className="lifecycle-status lifecycle-status-muted">{entry.chainStatus === "LEGACY" ? "Legacy registry" : entry.chainStatus}</span><small>{entry.chainStatus === "LEGACY" ? "Custody actions are not available for this V1 record." : entry.chainStatus === "REGISTRY_UNRESOLVED" ? "Saved registry provenance is incomplete; no chain was selected." : "Chain state could not be confirmed."}</small></>
                  )}
                </div>
                <div className="lifecycle-product-action">
                  {showRecoveryForm ? (
                    <form className="lifecycle-recovery" onSubmit={(event) => { event.preventDefault(); recoverSubmittedHash(entry); }}>
                      <label htmlFor={`lifecycle-hash-${product.productCode}`}>{legacyRevertedRecovery ? "Check another already-submitted transaction" : "Reconcile submitted transaction"}</label>
                      <input
                        id={`lifecycle-hash-${product.productCode}`}
                        value={recoveryHashes[product.productCode] || ""}
                        onChange={(event) => setRecoveryHashes((current) => ({ ...current, [product.productCode]: event.target.value }))}
                        placeholder="0x transaction hash"
                        autoComplete="off"
                        spellCheck="false"
                      />
                      <button type="submit" className="primary-button" disabled={busyCode === product.productCode}>{legacyRevertedRecovery ? "Verify existing hash" : "Check same operation"}</button>
                      <small>{legacyRevertedRecovery ? "Only use a hash for a transaction already submitted for this operation. This will not open the wallet." : "This operation is retained for reconciliation. Do not send another transaction."}</small>
                    </form>
                  ) : reviewRequired ? (
                    <span className="lifecycle-review" role="status">Needs administrator review; not confirmed</span>
                  ) : pending?.transactionHash ? (
                    <button type="button" className="primary-button" disabled={busyCode === product.productCode} onClick={() => runAction(entry)}>
                      {busyCode === product.productCode ? "Checking receipt…" : "Retry confirmation"}
                    </button>
                  ) : action && entry.chainStatus === "AVAILABLE" ? (
                    <button type="button" className="primary-button" disabled={busyCode === product.productCode} onClick={() => runAction(entry)}>
                      {busyCode === product.productCode ? "Waiting for confirmation…" : lastFailure ? "Retry after failed transaction" : action[1]}
                    </button>
                  ) : <span className="lifecycle-next-step">{entry.chainStatus === "AVAILABLE" ? "Waiting for the next assigned participant" : "No action available"}</span>}
                </div>
                {lastFailure && <small className="lifecycle-failure">Previous transaction reverted · {lastFailure.transactionHash ? `${lastFailure.transactionHash.slice(0, 10)}…${lastFailure.transactionHash.slice(-8)}` : "hash unavailable"}</small>}
                {reviewRequired && <small className="lifecycle-review">Saved transaction requires review: {reviewRequired.reviewReason || "evidence could not be reconciled"}</small>}
              </article>
            );
          })}
        </div>
      )}
      {role === "RETAILER" && <p className="lifecycle-sale-note">“Record retailer-reported sale” is an explicit retailer attestation; QR verification never changes the product state.</p>}
    </section>
  );
}

export default LifecycleWorkflow;
