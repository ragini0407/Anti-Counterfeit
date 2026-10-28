import test from "node:test";
import assert from "node:assert/strict";
import { submitLifecycleAction, resumeLifecycleSubmission, confirmLifecycleOperation } from "../src/lifecycleClient.js";

const operation = {
  operationId: "op-1",
  status: "PREPARED",
  actorWallet: "0x1111111111111111111111111111111111111111",
  transaction: { to: "0x2222222222222222222222222222222222222222", data: "0x1234", value: "0x0" }
};

const makeFetch = (calls, confirmResponse = { success: true, operation: { status: "CONFIRMED" } }) => async (url, options) => {
  calls.push({ url, options });
  return {
    ok: true,
    json: async () => calls.length === 1
      ? { success: true, operation }
      : calls.length === 2
        ? { success: true, operation: { ...operation, status: "SUBMITTING" } }
        : confirmResponse
  };
};

test("lifecycle wallet client prepares, checks wallet, claims before send, then confirms the same hash", async () => {
  const calls = [];
  const walletCalls = [];
  const result = await submitLifecycleAction({
    productCode: "FPD-V2-1",
    action: "DISPATCH_TO_DISTRIBUTOR",
    token: "test-token",
    fetchImpl: makeFetch(calls),
    ethereum: { request: async (request) => {
      walletCalls.push(request);
      if (request.method === "eth_chainId") return "0xaa36a7";
      if (request.method === "eth_requestAccounts") return [operation.actorWallet];
      if (request.method === "eth_sendTransaction") return `0x${"a".repeat(64)}`;
      throw new Error("Unexpected wallet request");
    } }
  });
  assert.equal(result.status, "CONFIRMED");
  assert.equal(walletCalls.at(-1).params[0].to, operation.transaction.to);
  assert.equal(calls.length, 3);
  assert.match(calls[1].url, /lifecycle\/operations\/op-1\/claim$/);
  assert.match(calls[2].url, /lifecycle\/operations\/op-1\/confirm$/);
  assert.match(JSON.parse(calls[1].options.body).submissionAttemptId, /^[\da-f-]{16,64}$/i);
  assert.equal(JSON.parse(calls[2].options.body).transactionHash, `0x${"a".repeat(64)}`);
});

test("wrong chain or wallet fails before requesting a transaction", async () => {
  for (const { chainId, accounts, expected } of [
    { chainId: "0x1", accounts: [operation.actorWallet], expected: /Sepolia/i },
    { chainId: "0xaa36a7", accounts: ["0x3333333333333333333333333333333333333333"], expected: /approved website account/i }
  ]) {
    let sent = false;
    await assert.rejects(submitLifecycleAction({
      productCode: "FPD-V2-1",
      action: "DISPATCH_TO_DISTRIBUTOR",
      token: "test-token",
      fetchImpl: makeFetch([]),
      ethereum: { request: async ({ method }) => {
        if (method === "eth_chainId") return chainId;
        if (method === "eth_requestAccounts") return accounts;
        if (method === "eth_sendTransaction") { sent = true; return "0x1"; }
        return null;
      } }
    }), expected);
    assert.equal(sent, false);
  }
});

test("transaction submission with unavailable backend confirmation exposes only a same-hash retry", async () => {
  const calls = [];
  const err = Object.assign(new Error("confirmation unavailable"), { status: 503 });
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? { ok: true, json: async () => ({ success: true, operation }) }
      : calls.length === 2
        ? { ok: true, json: async () => ({ success: true, operation: { ...operation, status: "SUBMITTING" } }) }
        : { ok: false, status: 503, json: async () => ({ message: err.message }) };
  };
  await assert.rejects(submitLifecycleAction({
    productCode: "FPD-V2-1",
    action: "DISPATCH_TO_DISTRIBUTOR",
    token: "test-token",
    fetchImpl,
    ethereum: { request: async ({ method }) => method === "eth_chainId" ? "0xaa36a7" : method === "eth_requestAccounts" ? [operation.actorWallet] : `0x${"b".repeat(64)}` }
  }), (error) => {
    assert.equal(error.confirmationPending, true);
    assert.equal(error.operationId, operation.operationId);
    assert.equal(error.transactionHash, `0x${"b".repeat(64)}`);
    return true;
  });
});

test("definitive API rejection is not represented as a pending confirmation", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? { ok: true, json: async () => ({ success: true, operation }) }
      : calls.length === 2
        ? { ok: true, json: async () => ({ success: true, operation: { ...operation, status: "SUBMITTING" } }) }
        : { ok: false, status: 409, json: async () => ({ code: "LIFECYCLE_REQUEST_FAILED", message: "Receipt does not match" }) };
  };
  await assert.rejects(submitLifecycleAction({
    productCode: "FPD-V2-1",
    action: "DISPATCH_TO_DISTRIBUTOR",
    token: "test-token",
    fetchImpl,
    ethereum: { request: async ({ method }) => method === "eth_chainId" ? "0xaa36a7" : method === "eth_requestAccounts" ? [operation.actorWallet] : `0x${"d".repeat(64)}` }
  }), (error) => {
    assert.equal(error.confirmationRejected, true);
    assert.equal(error.confirmationPending, undefined);
    assert.equal(error.status, 409);
    return true;
  });
});

test("a backend-recorded reverted receipt is a definitive transaction failure", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? { ok: true, json: async () => ({ success: true, operation }) }
      : calls.length === 2
        ? { ok: true, json: async () => ({ success: true, operation: { ...operation, status: "SUBMITTING" } }) }
        : { ok: true, json: async () => ({ success: true, operation: { status: "FAILED", failureCode: "TRANSACTION_REVERTED" } }) };
  };
  await assert.rejects(submitLifecycleAction({
    productCode: "FPD-V2-1",
    action: "DISPATCH_TO_DISTRIBUTOR",
    token: "test-token",
    fetchImpl,
    ethereum: { request: async ({ method }) => method === "eth_chainId" ? "0xaa36a7" : method === "eth_requestAccounts" ? [operation.actorWallet] : `0x${"e".repeat(64)}` }
  }), (error) => {
    assert.equal(error.transactionFailed, true);
    assert.equal(error.confirmationPending, undefined);
    return true;
  });
});

test("two browser attempts cannot submit competing hashes for the same operation", async () => {
  const calls = [];
  let sends = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/claim")) {
      return calls.filter((call) => call.url.endsWith("/claim")).length === 1
        ? { ok: true, json: async () => ({ success: true, operation: { ...operation, status: "SUBMITTING" } }) }
        : { ok: false, status: 409, json: async () => ({ message: "Another browser session already claimed this lifecycle operation" }) };
    }
    if (url.endsWith("/confirm")) return { ok: true, json: async () => ({ success: true, operation: { ...operation, status: "CONFIRMED" } }) };
    return { ok: true, json: async () => ({ success: true, operation }) };
  };
  const makeEthereum = () => ({ request: async ({ method }) => {
    if (method === "eth_chainId") return "0xaa36a7";
    if (method === "eth_requestAccounts") return [operation.actorWallet];
    if (method === "eth_sendTransaction") { sends += 1; return `0x${"1".repeat(64)}`; }
    return null;
  } });
  const first = await submitLifecycleAction({ productCode: "P", action: "DISPATCH_TO_DISTRIBUTOR", token: "t", fetchImpl, ethereum: makeEthereum() });
  assert.equal(first.status, "CONFIRMED");
  assert.equal(sends, 1);
  assert.equal(calls.filter((call) => call.url.endsWith("/claim")).length, 1);
  await assert.rejects(resumeLifecycleSubmission({
    operationId: "op-1", submissionAttemptId: "attempt-second-browser-0001", token: "t", fetchImpl, ethereum: makeEthereum()
  }), /Another browser session/i);
  assert.equal(sends, 1);
});

test("a failed claim response does not send a transaction and can resume with the same attempt ID", async () => {
  const calls = [];
  let sends = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const claimCalls = calls.filter((call) => call.url.endsWith("/claim"));
    if (url.endsWith("/claim") && claimCalls.length === 1) throw new Error("temporary network interruption");
    if (url.endsWith("/confirm")) return { ok: true, json: async () => ({ success: true, operation: { ...operation, status: "CONFIRMED" } }) };
    return { ok: true, json: async () => ({ success: true, operation: { ...operation, status: "SUBMITTING" } }) };
  };
  const attemptId = "attempt-recover-claim-00001";
  const ethereum = { request: async ({ method }) => {
    if (method === "eth_chainId") return "0xaa36a7";
    if (method === "eth_requestAccounts") return [operation.actorWallet];
    if (method === "eth_sendTransaction") { sends += 1; return `0x${"2".repeat(64)}`; }
    return null;
  } };
  await assert.rejects(resumeLifecycleSubmission({ operationId: "op-1", submissionAttemptId: attemptId, token: "t", fetchImpl, ethereum }), (error) => {
    assert.equal(error.claimUnknown, true);
    assert.equal(error.submissionAttemptId, attemptId);
    return true;
  });
  assert.equal(sends, 0);
  const result = await resumeLifecycleSubmission({ operationId: "op-1", submissionAttemptId: attemptId, token: "t", fetchImpl, ethereum });
  assert.equal(result.status, "CONFIRMED");
  assert.equal(sends, 1);
});

test("retry confirmation makes no wallet transaction request", async () => {
  const calls = [];
  const result = await confirmLifecycleOperation({
    operationId: "op-1",
    transactionHash: `0x${"c".repeat(64)}`,
    token: "test-token",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ success: true, operation: { status: "CONFIRMED" } }) };
    }
  });
  assert.equal(result.status, "CONFIRMED");
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].options.body).transactionHash, `0x${"c".repeat(64)}`);
});
