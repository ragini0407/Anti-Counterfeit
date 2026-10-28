import { apiUrl } from "./api.js";

const requestJson = async (url, { token, method = "GET", body, fetchImpl = fetch } = {}) => {
  const response = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || "Lifecycle service request failed");
    error.status = response.status;
    error.code = data.code || null;
    throw error;
  }
  return data;
};

const getAttemptId = () => globalThis.crypto?.randomUUID?.() ||
  `attempt-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const fetchLifecycleProducts = (token, fetchImpl) =>
  requestJson(apiUrl("/products/lifecycle"), { token, fetchImpl });

export const claimLifecycleSubmission = async ({ operationId, submissionAttemptId, token, fetchImpl }) => {
  const data = await requestJson(
    apiUrl(`/products/lifecycle/operations/${encodeURIComponent(operationId)}/claim`),
    { token, method: "POST", body: { submissionAttemptId }, fetchImpl }
  );
  return data.operation;
};

export const releaseLifecycleSubmission = async ({ operationId, submissionAttemptId, token, fetchImpl }) => {
  const data = await requestJson(
    apiUrl(`/products/lifecycle/operations/${encodeURIComponent(operationId)}/release`),
    { token, method: "POST", body: { submissionAttemptId }, fetchImpl }
  );
  return data.operation;
};

export const confirmLifecycleOperation = async ({ operationId, transactionHash, submissionAttemptId, token, fetchImpl }) => {
  const data = await requestJson(
    apiUrl(`/products/lifecycle/operations/${encodeURIComponent(operationId)}/confirm`),
    { token, method: "POST", body: { transactionHash, submissionAttemptId }, fetchImpl }
  );
  if (data.operation?.status === "REVIEW_REQUIRED") {
    const error = new Error("The transaction is saved but could not be reconciled against its lifecycle event and chain state. No success is reported; administrator review is required.");
    error.reviewRequired = true;
    error.operation = data.operation;
    error.operationId = operationId;
    error.transactionHash = data.operation.transactionHash || transactionHash;
    throw error;
  }
  return data.operation;
};

const sendClaimedLifecycleTransaction = async ({ operation, sender, submissionAttemptId, token, ethereum, fetchImpl, onSubmitted }) => {
  let transactionHash;
  try {
    transactionHash = await ethereum.request({
      method: "eth_sendTransaction",
      params: [{
        from: sender,
        to: operation.transaction.to,
        data: operation.transaction.data,
        value: operation.transaction.value
      }]
    });
  } catch (cause) {
    if (cause?.code === 4001) {
      try {
        await releaseLifecycleSubmission({ operationId: operation.operationId, submissionAttemptId, token, fetchImpl });
        const error = new Error("The wallet request was rejected. No lifecycle transaction was submitted; the same operation is available to try again.");
        error.walletRejected = true;
        error.operationId = operation.operationId;
        throw error;
      } catch (releaseError) {
        if (releaseError.walletRejected) throw releaseError;
        const error = new Error("The wallet request was rejected, but the backend could not release its reservation. Refresh and reconcile this same operation before trying again.");
        error.claimReleasePending = true;
        error.operationId = operation.operationId;
        error.submissionAttemptId = submissionAttemptId;
        error.cause = releaseError;
        throw error;
      }
    }
    const error = new Error("MetaMask did not return a transaction hash. The operation remains reserved; check wallet activity before taking another action.");
    error.submissionUnknown = true;
    error.operationId = operation.operationId;
    error.submissionAttemptId = submissionAttemptId;
    error.cause = cause;
    throw error;
  }

  try {
    onSubmitted?.({ operationId: operation.operationId, submissionAttemptId, transactionHash });
  } catch {
    // Continue to backend confirmation. The operation/hash are also retained server-side
    // before RPC polling, so unavailable browser storage cannot authorize another send.
  }
  try {
    const confirmed = await confirmLifecycleOperation({ operationId: operation.operationId, transactionHash, submissionAttemptId, token, fetchImpl });
    if (confirmed.status === "FAILED") {
      const error = new Error("Sepolia confirms this transaction reverted. No lifecycle transition was recorded.");
      error.transactionFailed = true;
      error.operation = confirmed;
      error.transactionHash = transactionHash;
      throw error;
    }
    return confirmed;
  } catch (cause) {
    if (cause.transactionFailed || cause.reviewRequired) throw cause;
    const error = new Error("Transaction was submitted. Confirmation is not yet established; retry only with this same transaction hash.");
    error.cause = cause;
    error.operationId = operation.operationId;
    error.transactionHash = transactionHash;
    error.status = cause.status;
    error.code = cause.code || null;
    if (!Number.isInteger(cause.status) || cause.status >= 500) {
      error.confirmationPending = true;
    } else if ([401, 403, 429].includes(cause.status)) {
      error.confirmationUnavailable = true;
    } else {
      error.confirmationRejected = true;
    }
    throw error;
  }
};

export const resumeLifecycleSubmission = async ({ operationId, submissionAttemptId, token, ethereum, fetchImpl = fetch, onSubmitted }) => {
  if (!ethereum?.request) throw new Error("MetaMask is required to submit this lifecycle action");
  const chainHex = await ethereum.request({ method: "eth_chainId" });
  if (BigInt(chainHex) !== 11155111n) throw new Error("Switch MetaMask to Ethereum Sepolia before continuing");
  const accounts = await ethereum.request({ method: "eth_requestAccounts" });
  const sender = accounts?.[0];
  if (!sender) throw new Error("Select the wallet bound to your approved website account in MetaMask");
  let operation;
  try {
    operation = await claimLifecycleSubmission({ operationId, submissionAttemptId, token, fetchImpl });
  } catch (cause) {
    const error = new Error(cause.message || "The lifecycle submission reservation could not be confirmed");
    error.status = cause.status;
    error.code = cause.code;
    error.claimUnknown = !Number.isInteger(cause.status) || cause.status >= 500;
    error.operationId = operationId;
    error.submissionAttemptId = submissionAttemptId;
    throw error;
  }
  if (operation.transactionHash) {
    const error = new Error("This operation already has a transaction hash. Use same-hash confirmation; do not submit again.");
    error.transactionHash = operation.transactionHash;
    error.operationId = operationId;
    throw error;
  }
  if (sender.toLowerCase() !== operation.actorWallet.toLowerCase()) {
    const error = new Error("Select the wallet bound to your approved website account in MetaMask");
    try {
      await releaseLifecycleSubmission({ operationId, submissionAttemptId, token, fetchImpl });
    } catch (releaseError) {
      error.claimReleasePending = true;
      error.operationId = operationId;
      error.submissionAttemptId = submissionAttemptId;
      error.cause = releaseError;
    }
    throw error;
  }
  return sendClaimedLifecycleTransaction({ operation, sender, submissionAttemptId, token, ethereum, fetchImpl, onSubmitted });
};

export const submitLifecycleAction = async ({ productCode, action, token, ethereum, fetchImpl = fetch, onSubmitted }) => {
  if (!ethereum?.request) throw new Error("MetaMask is required to submit this lifecycle action");
  const data = await requestJson(
    apiUrl(`/products/${encodeURIComponent(productCode)}/lifecycle/prepare`),
    { token, method: "POST", body: { action }, fetchImpl }
  );
  const operation = data.operation;
  if (operation.status !== "PREPARED") {
    const error = new Error("This product already has an unresolved lifecycle operation. Reconcile that operation before submitting another.");
    error.operationId = operation.operationId;
    error.transactionHash = operation.transactionHash || null;
    throw error;
  }
  const submissionAttemptId = getAttemptId();
  return resumeLifecycleSubmission({
    operationId: operation.operationId,
    submissionAttemptId,
    token,
    ethereum,
    fetchImpl,
    onSubmitted
  });
};
