const test = require("node:test");
const assert = require("node:assert/strict");
const { ethers } = require("ethers");
const {
  prepareLifecycleAction,
  claimLifecycleSubmission,
  releaseLifecycleSubmission,
  confirmLifecycleAction
} = require("../services/productLifecycleService");

const accounts = {
  mfr: "0x1111111111111111111111111111111111111111",
  dist: "0x2222222222222222222222222222222222222222",
  retail: "0x3333333333333333333333333333333333333333",
  wrong: "0x4444444444444444444444444444444444444444"
};
const registryAddress = "0x5555555555555555555555555555555555555555";
const transitions = {
  DISPATCH_TO_DISTRIBUTOR: [0, 1, accounts.dist, accounts.mfr],
  RECEIVE_BY_DISTRIBUTOR: [1, 2, accounts.mfr, accounts.dist],
  DISPATCH_TO_RETAILER: [2, 3, accounts.retail, accounts.dist],
  RECEIVE_BY_RETAILER: [3, 4, accounts.dist, accounts.retail],
  RECORD_SALE: [4, 5, ethers.ZeroAddress, accounts.retail]
};

const harness = () => {
  const users = {
    manufacturer: { status: "ACTIVE", role: "MANUFACTURER", walletAddress: accounts.mfr, walletVerifiedAt: new Date() },
    distributor: { status: "ACTIVE", role: "DISTRIBUTOR", walletAddress: accounts.dist, walletVerifiedAt: new Date() },
    retailer: { status: "ACTIVE", role: "RETAILER", walletAddress: accounts.retail, walletVerifiedAt: new Date() },
    wrong: { status: "ACTIVE", role: "DISTRIBUTOR", walletAddress: accounts.wrong, walletVerifiedAt: new Date() }
  };
  const profiles = {
    manufacturer: { _id: "mfr-profile", verificationStatus: "VERIFIED" },
    distributor: { _id: "dist-profile", verificationStatus: "VERIFIED" },
    retailer: { _id: "retail-profile", verificationStatus: "VERIFIED" },
    wrong: { _id: "wrong-profile", verificationStatus: "VERIFIED" }
  };
  const product = {
    _id: "product-document-id",
    productCode: "FPD-V2-1",
    manufacturerId: "mfr-profile",
    manufacturerWallet: accounts.mfr,
    authorizedDistributor: accounts.dist,
    authorizedDistributorId: "dist-profile",
    authorizedRetailer: accounts.retail,
    authorizedRetailerId: "retail-profile",
    productHash: "a".repeat(64),
    registryVersion: 2,
    registryAddress
  };
  const chainProduct = {
    productId: product.productCode,
    manufacturerId: product.manufacturerId,
    manufacturer: accounts.mfr,
    currentOwner: accounts.mfr,
    currentCustodian: accounts.mfr,
    productHash: product.productHash,
    authorizedDistributor: accounts.dist,
    authorizedRetailer: accounts.retail,
    state: 0
  };
  const operations = [];
  let prepared;
  let event;
  let badTransaction = null;
  let receiptStatus = 1;
  let waitError = null;
  let waitOverride = null;
  let laterBlockEvents = [];
  let failFinalWrite = false;
  let confirmedWrites = 0;
  const matches = (doc, query) => Object.entries(query).every(([key, expected]) => {
    if (expected && typeof expected === "object" && "$exists" in expected) return (doc[key] !== undefined) === expected.$exists;
    if (expected && typeof expected === "object" && "$lte" in expected) return new Date(doc[key]) <= expected.$lte;
    if (expected && typeof expected === "object" && "$gt" in expected) return new Date(doc[key]) > expected.$gt;
    if (expected && typeof expected === "object" && "$in" in expected) return expected.$in.some((candidate) => candidate == null ? doc[key] == null : String(doc[key]) === String(candidate));
    return expected == null ? doc[key] == null : String(doc[key]) === String(expected);
  });
  const queryResult = (value) => ({ lean: async () => value });
  const deps = {
    User: { findById: async (id) => users[id] || null },
    Manufacturer: { findOne: async () => profiles.manufacturer },
    SupplyChainPartner: { findOne: async ({ userId }) => profiles[userId] || null },
    Product: {
      findOne: (filter) => queryResult(
        filter.productCode === product.productCode &&
        (!filter.authorizedDistributorId || filter.authorizedDistributorId === product.authorizedDistributorId) &&
        (!filter.authorizedRetailerId || filter.authorizedRetailerId === product.authorizedRetailerId) &&
        (!filter.manufacturerId || filter.manufacturerId === product.manufacturerId)
          ? product
          : null
      ),
      findById: (id) => queryResult(id === product._id ? product : null)
    },
    ProductLifecycleOperation: {
      findOne: (filter) => queryResult(operations.find((item) => matches(item, filter)) || null),
      create: async (value) => {
        if (operations.some((item) => item.activeProductKey && item.activeProductKey === value.activeProductKey)) {
          throw Object.assign(new Error("duplicate active product"), { code: 11000 });
        }
        operations.push({ ...value });
        return { ...value };
      },
      findOneAndUpdate: async (filter, update) => {
        if (failFinalWrite && update.$set?.status === "CONFIRMED") {
          failFinalWrite = false;
          return null;
        }
        const item = operations.find((value) => matches(value, filter));
        if (!item) return null;
        Object.assign(item, update.$set || {});
        for (const [key, value] of Object.entries(update.$addToSet || {})) {
          const additions = value && typeof value === "object" && "$each" in value ? value.$each : [value];
          item[key] ||= [];
          for (const addition of additions) if (!item[key].includes(addition)) item[key].push(addition);
        }
        for (const key of Object.keys(update.$unset || {})) delete item[key];
        if (item.status === "CONFIRMED") confirmedWrites += 1;
        return { ...item };
      }
    },
    blockchainV2: {
      CONTRACT_ADDRESS: registryAddress,
      SEPOLIA_CHAIN_ID: 11155111,
      getRole: async (address) => address === accounts.mfr ? 1 : address === accounts.dist || address === accounts.wrong ? 2 : 3,
      getProduct: async () => ({ ...chainProduct }),
      encodeLifecycleTransaction: (action, code) => {
        prepared = { action, actor: WALLET_FOR_ACTION[action], data: `0x${Buffer.from(`${action}:${code}`).toString("hex")}` };
        return prepared.data;
      },
      waitForMintTransaction: async (transactionHash) => {
        if (waitOverride) return waitOverride(transactionHash);
        if (waitError) throw waitError;
        const pending = operations.find((item) => ["PREPARED", "SUBMITTING"].includes(item.status));
        if (badTransaction) return { receipt: { status: 1, blockNumber: 77 }, transaction: badTransaction };
        const [previousState, newState, counterparty, custodian] = transitions[pending.action];
        if (receiptStatus === 1) {
          chainProduct.state = newState;
          chainProduct.currentOwner = custodian;
          chainProduct.currentCustodian = custodian;
        }
        event = {
          productCode: product.productCode,
          actor: pending.actorWallet,
          counterparty,
          previousState,
          newState,
          custodian,
          timestamp: 1790000000,
          logIndex: 0,
          transactionHash,
          blockNumber: 77
        };
        return {
          receipt: { status: receiptStatus, blockNumber: 77 },
          transaction: {
            chainId: 11155111,
            hash: transactionHash,
            from: pending.actorWallet,
            to: registryAddress,
            value: 0n,
            data: prepared.data,
            hash: transactionHash
          }
        };
      },
      parseLifecycleEvent: () => event,
      getLifecycleEventsInBlock: async () => [event, ...laterBlockEvents],
      getAdminAddress: async () => accounts.admin
    }
  };
  deps.blockchainV2.encodeLifecycleTransaction = (action, code) => {
    prepared = { action, actor: WALLET_FOR_ACTION[action], data: `0x${Buffer.from(`${action}:${code}`).toString("hex")}` };
    return prepared.data;
  };
  deps.blockchainV2.getProduct = async (_code, options = {}) => {
    if (options.blockTag !== undefined && prepared) {
      if (laterBlockEvents.length) {
        const final = laterBlockEvents.at(-1);
        return { ...chainProduct, state: final.newState, currentOwner: final.custodian, currentCustodian: final.custodian };
      }
      const [, state, , owner] = transitions[prepared.action];
      return { ...chainProduct, state, currentOwner: owner, currentCustodian: owner };
    }
    return { ...chainProduct };
  };
  deps.blockchainV2.parseLifecycleEvent = () => event;

  return {
    deps,
    operations,
    chainProduct,
    setBadTransaction: (tx) => { badTransaction = tx; },
    setReceiptStatus: (status) => { receiptStatus = status; },
    setWaitError: (error) => { waitError = error; },
    setWaitOverride: (handler) => { waitOverride = handler; },
    setLaterBlockEvents: (events) => { laterBlockEvents = events; },
    failFinalWrite: () => { failFinalWrite = true; },
    getConfirmedWrites: () => confirmedWrites
  };
};

const USER_FOR_ROLE = { MANUFACTURER: "manufacturer", DISTRIBUTOR: "distributor", RETAILER: "retailer" };
const ACTOR_FOR_ACTION = {
  DISPATCH_TO_DISTRIBUTOR: "manufacturer",
  RECEIVE_BY_DISTRIBUTOR: "distributor",
  DISPATCH_TO_RETAILER: "distributor",
  RECEIVE_BY_RETAILER: "retailer",
  RECORD_SALE: "retailer"
};
const WALLET_FOR_ACTION = {
  DISPATCH_TO_DISTRIBUTOR: accounts.mfr,
  RECEIVE_BY_DISTRIBUTOR: accounts.dist,
  DISPATCH_TO_RETAILER: accounts.dist,
  RECEIVE_BY_RETAILER: accounts.retail,
  RECORD_SALE: accounts.retail
};

test("only the verified account role and assigned profile can prepare a lifecycle action", async () => {
  const h = harness();
  await assert.rejects(
    prepareLifecycleAction({ userId: "wrong", role: "DISTRIBUTOR", productCode: "FPD-V2-1", action: "RECEIVE_BY_DISTRIBUTOR" }, h.deps),
    /not found|assigned participant|profile/i
  );
  await assert.rejects(
    prepareLifecycleAction({ userId: "distributor", role: "DISTRIBUTOR", productCode: "FPD-V2-1", action: "RECORD_SALE" }, h.deps),
    /cannot perform/i
  );
});

test("complete five-step lifecycle is persisted only after verified receipt and chain state", async () => {
  const h = harness();
  for (const [action, [previousState, newState]] of Object.entries(transitions)) {
    const userId = ACTOR_FOR_ACTION[action];
    const role = userId.toUpperCase();
    const op = await prepareLifecycleAction({ userId, role, productCode: "FPD-V2-1", action }, h.deps);
    assert.equal(op.status, "PREPARED");
    assert.equal(op.previousState, previousState);
    assert.equal(op.newState, newState);
    const done = await confirmLifecycleAction({ userId, role, operationId: op.operationId, transactionHash: `0x${String(newState).padStart(64, "0")}` }, h.deps);
    assert.equal(done.status, "CONFIRMED");
    assert.equal(done.newState, newState);
  }
  assert.equal(h.operations.length, 5);
  assert.equal(h.chainProduct.state, 5);
});

test("concurrent duplicate preparation reuses one saved operation", async () => {
  const h = harness();
  const input = { userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" };
  const [first, second] = await Promise.all([
    prepareLifecycleAction(input, h.deps),
    prepareLifecycleAction(input, h.deps)
  ]);
  assert.equal(first.operationId, second.operationId);
  assert.equal(h.operations.length, 1);
});

test("wrong sender or calldata is saved as review-required and never reported confirmed", async () => {
  const h = harness();
  const op = await prepareLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" }, h.deps);
  const transactionHash = `0x${"1".repeat(64)}`;
  h.setBadTransaction({ chainId: 11155111, hash: transactionHash, from: accounts.wrong, to: registryAddress, value: 0n, data: op.transaction.data });
  const review = await confirmLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, transactionHash }, h.deps);
  assert.equal(review.status, "REVIEW_REQUIRED");
  assert.equal(review.failureCode, "CONFIRMATION_REJECTED");
  assert.equal(h.operations[0].transactionHash, transactionHash);
  assert.equal(h.getConfirmedWrites(), 0);
  h.setBadTransaction(null);
  const repeated = await confirmLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, transactionHash }, h.deps);
  assert.equal(repeated.status, "REVIEW_REQUIRED");
  await assert.rejects(
    confirmLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, transactionHash: `0x${"f".repeat(64)}` }, h.deps),
    /already bound/i
  );
});

test("repeated confirmation reuses the same transaction and creates no duplicate event", async () => {
  const h = harness();
  const op = await prepareLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" }, h.deps);
  const data = { userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, transactionHash: `0x${"2".repeat(64)}` };
  const first = await confirmLifecycleAction(data, h.deps);
  const retry = await confirmLifecycleAction(data, h.deps);
  assert.equal(first.transactionHash, retry.transactionHash);
  assert.equal(retry.idempotent, true);
  assert.equal(h.operations.length, 1);
  assert.equal(h.getConfirmedWrites(), 1);
});

test("atomic submission claim blocks a second browser session from sending a competing hash", async () => {
  const h = harness();
  const op = await prepareLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" }, h.deps);
  const first = await claimLifecycleSubmission({
    userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, submissionAttemptId: "attempt-browser-session-0001"
  }, h.deps);
  assert.equal(first.status, "SUBMITTING");
  const repeated = await claimLifecycleSubmission({
    userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, submissionAttemptId: "attempt-browser-session-0001"
  }, h.deps);
  assert.equal(repeated.idempotent, true);
  await assert.rejects(claimLifecycleSubmission({
    userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, submissionAttemptId: "attempt-other-browser-00002"
  }, h.deps), /already claimed|another browser/i);
  assert.equal(h.operations.length, 1);
  assert.equal(h.operations[0].submissionAttemptId, "attempt-browser-session-0001");
});

test("wallet rejection releases only the no-hash claim and reuses the original operation ID", async () => {
  const h = harness();
  const op = await prepareLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" }, h.deps);
  const attempt = "attempt-wallet-rejected-00001";
  await claimLifecycleSubmission({ userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, submissionAttemptId: attempt }, h.deps);
  const released = await releaseLifecycleSubmission({ userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, submissionAttemptId: attempt }, h.deps);
  assert.equal(released.status, "PREPARED");
  assert.equal(released.operationId, op.operationId);
  assert.equal(released.idempotent, undefined);
  assert.equal(h.operations.length, 1);
  const repeatedRelease = await releaseLifecycleSubmission({ userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, submissionAttemptId: attempt }, h.deps);
  assert.equal(repeatedRelease.idempotent, true);
});

test("claimed operations stay attached to their operation ID beyond the preparation expiry", async () => {
  const h = harness();
  const op = await prepareLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" }, h.deps);
  const attempt = "attempt-long-running-000001";
  await claimLifecycleSubmission({ userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, submissionAttemptId: attempt }, h.deps);
  h.operations[0].expiresAt = new Date(Date.now() - 60_000);
  await assert.rejects(prepareLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" }, h.deps), /already pending/i);
  const sameClaim = await claimLifecycleSubmission({ userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, submissionAttemptId: attempt }, h.deps);
  assert.equal(sameClaim.operationId, op.operationId);
  assert.equal(sameClaim.idempotent, true);
  assert.equal(h.operations.length, 1);
});

test("only a never-claimed version-2 preparation is replaced after expiry", async () => {
  const h = harness();
  const op = await prepareLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" }, h.deps);
  h.operations[0].expiresAt = new Date(Date.now() - 60_000);
  const refreshed = await prepareLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" }, h.deps);
  assert.notEqual(refreshed.operationId, op.operationId);
  assert.equal(h.operations.length, 1);
  assert.equal(h.operations[0].submissionProtocolVersion, 2);
  assert.equal(h.operations[0].status, "PREPARED");
});

test("legacy unclaimed operation is retained and remains reconcilable by its original ID", async () => {
  const h = harness();
  const op = await prepareLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" }, h.deps);
  delete h.operations[0].submissionProtocolVersion;
  h.operations[0].expiresAt = new Date(Date.now() - 60_000);
  const reused = await prepareLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" }, h.deps);
  assert.equal(reused.operationId, op.operationId);
  assert.equal(h.operations.length, 1);
  await assert.rejects(claimLifecycleSubmission({
    userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, submissionAttemptId: "attempt-legacy-recovery-0001"
  }, h.deps), /already claimed|expired|no longer available/i);
  const reconciled = await confirmLifecycleAction({
    userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, transactionHash: `0x${"4".repeat(64)}`
  }, h.deps);
  assert.equal(reconciled.status, "CONFIRMED");
  assert.equal(reconciled.operationId, op.operationId);
});

test("a competing hash cannot race a legacy confirmation; after the revert it can reconcile the same operation", async () => {
  const h = harness();
  const op = await prepareLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" }, h.deps);
  delete h.operations[0].submissionProtocolVersion;
  const revertedHash = `0x${"7".repeat(64)}`;
  const successfulHash = `0x${"8".repeat(64)}`;
  const operationData = { userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId };

  let signalStarted;
  let releaseFirstReceipt;
  const firstWaitStarted = new Promise((resolve) => { signalStarted = resolve; });
  const allowFirstReceipt = new Promise((resolve) => { releaseFirstReceipt = resolve; });
  h.setWaitOverride(async (transactionHash) => {
    signalStarted();
    await allowFirstReceipt;
    return {
      receipt: { status: 0, blockNumber: 77 },
      transaction: {
        chainId: 11155111,
        hash: transactionHash,
        from: accounts.mfr,
        to: registryAddress,
        value: 0n,
        data: op.transaction.data
      }
    };
  });
  const firstConfirmation = confirmLifecycleAction({ ...operationData, transactionHash: revertedHash }, h.deps);
  await firstWaitStarted;
  await assert.rejects(
    confirmLifecycleAction({ ...operationData, transactionHash: successfulHash }, h.deps),
    /already bound to a different transaction/i
  );
  releaseFirstReceipt();
  const reverted = await firstConfirmation;
  assert.equal(reverted.status, "REVIEW_REQUIRED");
  assert.equal(reverted.reviewReason, "LEGACY_REVERTED_CANDIDATE");
  assert.equal(h.operations[0].activeProductKey, `2:${registryAddress.toLowerCase()}:FPD-V2-1`);

  h.setWaitOverride(null);
  h.setReceiptStatus(1);
  const confirmed = await confirmLifecycleAction({ ...operationData, transactionHash: successfulHash }, h.deps);
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(confirmed.transactionHash, successfulHash);
  assert.deepEqual(h.operations[0].observedTransactionHashes, [revertedHash, successfulHash]);
  const repeated = await confirmLifecycleAction({ ...operationData, transactionHash: revertedHash }, h.deps);
  assert.equal(repeated.status, "CONFIRMED");
  assert.equal(repeated.idempotent, true);
  assert.equal(h.getConfirmedWrites(), 1);
  assert.equal(h.operations.length, 1);
});

test("database confirmation failure remains retryable with the original transaction hash", async () => {
  const h = harness();
  const op = await prepareLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" }, h.deps);
  const data = { userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, transactionHash: `0x${"3".repeat(64)}` };
  h.failFinalWrite();
  await assert.rejects(confirmLifecycleAction(data, h.deps), /database record is pending/i);
  const retried = await confirmLifecycleAction(data, h.deps);
  assert.equal(retried.status, "CONFIRMED");
  assert.equal(retried.transactionHash, data.transactionHash);
});

test("a reverted receipt is recorded as FAILED, releases the product lock, and is idempotent", async () => {
  const h = harness();
  const op = await prepareLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" }, h.deps);
  const submissionAttemptId = "attempt-reverted-receipt-0001";
  await claimLifecycleSubmission({ userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, submissionAttemptId }, h.deps);
  const data = { userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, submissionAttemptId, transactionHash: `0x${"5".repeat(64)}` };
  h.setReceiptStatus(0);
  const failed = await confirmLifecycleAction(data, h.deps);
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.failureCode, "TRANSACTION_REVERTED");
  assert.equal(failed.transactionHash, data.transactionHash);
  const repeated = await confirmLifecycleAction(data, h.deps);
  assert.equal(repeated.status, "FAILED");
  assert.equal(repeated.idempotent, true);
  const next = await prepareLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" }, h.deps);
  assert.notEqual(next.operationId, op.operationId);
  assert.equal(h.operations.length, 2);
});

test("temporary RPC failure leaves confirmation retryable with the same hash", async () => {
  const h = harness();
  const op = await prepareLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" }, h.deps);
  const data = { userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, transactionHash: `0x${"6".repeat(64)}` };
  h.setWaitError(new Error("simulated RPC timeout"));
  await assert.rejects(confirmLifecycleAction(data, h.deps), /simulated RPC timeout/);
  assert.equal(h.operations[0].status, "SUBMITTING");
  assert.equal(h.operations[0].transactionHash, data.transactionHash);
  await assert.rejects(confirmLifecycleAction({ ...data, transactionHash: `0x${"e".repeat(64)}` }, h.deps), /already bound/i);
  h.setWaitError(null);
  const confirmed = await confirmLifecycleAction(data, h.deps);
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(confirmed.transactionHash, data.transactionHash);
});

test("temporary same-block log RPC failure does not claim or lose the submitted hash", async () => {
  const h = harness();
  const op = await prepareLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" }, h.deps);
  const data = { userId: "manufacturer", role: "MANUFACTURER", operationId: op.operationId, transactionHash: `0x${"b".repeat(64)}` };
  const readEvents = h.deps.blockchainV2.getLifecycleEventsInBlock;
  h.deps.blockchainV2.getLifecycleEventsInBlock = async () => { throw new Error("simulated log RPC timeout"); };
  await assert.rejects(confirmLifecycleAction(data, h.deps), /simulated log RPC timeout/);
  assert.equal(h.operations[0].status, "SUBMITTING");
  assert.equal(h.operations[0].transactionHash, data.transactionHash);
  h.deps.blockchainV2.getLifecycleEventsInBlock = readEvents;
  const confirmed = await confirmLifecycleAction(data, h.deps);
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(confirmed.transactionHash, data.transactionHash);
});

test("valid same-block transitions are replayed in log order before comparing block-end state", async () => {
  const h = harness();
  const op = await prepareLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" }, h.deps);
  h.setLaterBlockEvents([{
    productCode: "FPD-V2-1",
    actor: accounts.dist,
    counterparty: accounts.mfr,
    previousState: 1,
    newState: 2,
    custodian: accounts.dist,
    timestamp: 1790000001,
    logIndex: 1,
    transactionHash: `0x${"7".repeat(64)}`,
    blockNumber: 77
  }]);
  const confirmed = await confirmLifecycleAction({
    userId: "manufacturer",
    role: "MANUFACTURER",
    operationId: op.operationId,
    transactionHash: `0x${"8".repeat(64)}`
  }, h.deps);
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(confirmed.newState, 1);
  assert.equal(h.operations[0].status, "CONFIRMED");
});

test("same-block reconciliation rejects an unauthorized or discontinuous later event", async () => {
  const h = harness();
  const op = await prepareLifecycleAction({ userId: "manufacturer", role: "MANUFACTURER", productCode: "FPD-V2-1", action: "DISPATCH_TO_DISTRIBUTOR" }, h.deps);
  h.setLaterBlockEvents([{
    productCode: "FPD-V2-1",
    actor: accounts.wrong,
    counterparty: accounts.mfr,
    previousState: 1,
    newState: 2,
    custodian: accounts.dist,
    timestamp: 1790000001,
    logIndex: 1,
    transactionHash: `0x${"9".repeat(64)}`,
    blockNumber: 77
  }]);
  const review = await confirmLifecycleAction({
    userId: "manufacturer",
    role: "MANUFACTURER",
    operationId: op.operationId,
    transactionHash: `0x${"a".repeat(64)}`
  }, h.deps);
  assert.equal(review.status, "REVIEW_REQUIRED");
  assert.equal(review.failureCode, "CONFIRMATION_REJECTED");
  assert.equal(h.operations[0].status, "REVIEW_REQUIRED");
});
