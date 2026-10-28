const test = require("node:test");
const assert = require("node:assert/strict");

const Verification = require("../models/Verification");
const anomalyService = require("../services/anomalyService");
const qrVerificationService = require("../services/qrVerificationService");

const original = {
    findOne: Verification.findOne,
    create: Verification.create,
    countDocuments: Verification.countDocuments,
    analyze: anomalyService.analyzeScanBehavior,
    verifyQrProduct: qrVerificationService.verifyQrProduct
};

const controllerPath = require.resolve("../controllers/productController");
anomalyService.analyzeScanBehavior = async () => ({
    scanCount: 1,
    distinctLocations: null,
    avgTimeBetweenScansHr: null,
    anomalyScore: null,
    isSuspicious: null,
    scoringStatus: "UNAVAILABLE"
});
qrVerificationService.verifyQrProduct = async () => ({
    verified: true,
    status: "GENUINE",
    product: {
        productCode: "FPD-TEST",
        productName: "Test",
        category: "Test",
        brandName: "Test Brand",
        manufacturerId: { companyName: "Test Manufacturer" }
    },
    blockchain: { checked: true, exists: true, active: true, flagged: false, qrMatched: true }
});

const controller = require(controllerPath);
const records = new Map();
Verification.findOne = (query) => ({
    select: async () => records.get(query.scanRequestId) || null
});
Verification.create = async (data) => {
    if (records.has(data.scanRequestId)) throw Object.assign(new Error("duplicate"), { code: 11000 });
    const record = {
        ...data,
        async save() { records.set(this.scanRequestId, this); return this; }
    };
    records.set(data.scanRequestId, record);
    return record;
};
Verification.countDocuments = async ({ productCode }) =>
    [...records.values()].filter((record) => record.productCode === productCode).length;

const invoke = async (key, qrPayload = "signed-qr-payload", consent = { locationConsentStatus: "NOT_REQUESTED" }) => {
    let response;
    const req = {
        params: { productCode: "FPD-TEST" },
        body: { ...consent, qrPayload },
        headers: { "idempotency-key": key },
        get: () => key
    };
    const res = {
        status(code) { this.statusCode = code; return this; },
        json(body) { response = body; return this; }
    };
    await controller.verifyProductByQR(req, res);
    return { statusCode: res.statusCode, body: response };
};

test.after(() => {
    Verification.findOne = original.findOne;
    Verification.create = original.create;
    Verification.countDocuments = original.countDocuments;
    anomalyService.analyzeScanBehavior = original.analyze;
    qrVerificationService.verifyQrProduct = original.verifyQrProduct;
    delete require.cache[controllerPath];
});

test("QR authenticity remains genuine when anomaly scoring is unavailable", async () => {
    records.clear();
    const result = await invoke("scan-attempt-1");
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.verified, true);
    assert.equal(result.body.authenticityStatus, "GENUINE");
    assert.equal(result.body.scanBehavior.scoringStatus, "UNAVAILABLE");
    assert.equal(result.body.scanBehavior.isSuspicious, null);
    assert.equal(records.size, 1);
});

test("retry with the same idempotency key reuses one scan record", async () => {
    records.clear();
    const first = await invoke("scan-attempt-2");
    const retry = await invoke("scan-attempt-2");
    assert.equal(first.body.verified, true);
    assert.equal(retry.body.verified, true);
    assert.equal(records.size, 1);
});

test("concurrent duplicate requests create one scan record", async () => {
    records.clear();
    const results = await Promise.all([
        invoke("scan-attempt-concurrent"),
        invoke("scan-attempt-concurrent")
    ]);
    assert.ok(results.every((result) => result.statusCode === 200 && result.body.verified));
    assert.equal(records.size, 1);
});

test("an idempotency key cannot be reused for a different QR payload", async () => {
    records.clear();
    await invoke("scan-attempt-bound-payload", "first-payload");
    const replay = await invoke("scan-attempt-bound-payload", "different-payload");
    assert.equal(replay.statusCode, 409);
    assert.equal(records.size, 1);
});

test("granted consent is stored only with valid coordinates on that scan", async () => {
    records.clear();
    const result = await invoke("scan-location-granted", "signed-qr-payload", {
        locationConsentStatus: "GRANTED",
        latitude: 12.9716,
        longitude: 77.5946
    });
    const saved = [...records.values()][0];
    assert.equal(result.statusCode, 200);
    assert.equal(saved.locationConsentStatus, "GRANTED");
    assert.deepEqual(saved.location, { latitude: 12.9716, longitude: 77.5946 });
});

test("denied and not-requested consent are stored without coordinates", async () => {
    records.clear();
    await invoke("scan-location-denied", "signed-qr-payload", { locationConsentStatus: "DENIED" });
    await invoke("scan-location-not-requested", "signed-qr-payload", { locationConsentStatus: "NOT_REQUESTED" });
    const saved = [...records.values()];
    assert.deepEqual(saved.map((record) => record.locationConsentStatus), ["DENIED", "NOT_REQUESTED"]);
    assert.ok(saved.every((record) => record.location === undefined));
});

test("legacy requests remain UNKNOWN and their unconsented coordinates are discarded", async () => {
    records.clear();
    const result = await invoke("scan-location-unknown", "signed-qr-payload", {
        latitude: 12,
        longitude: 77
    });
    const retry = await invoke("scan-location-unknown", "signed-qr-payload", {
        latitude: 12,
        longitude: 77
    });
    const saved = [...records.values()][0];
    assert.equal(result.statusCode, 200);
    assert.equal(retry.statusCode, 200);
    assert.equal(records.size, 1);
    assert.equal(saved.locationConsentStatus, "UNKNOWN");
    assert.equal(saved.location, undefined);
});

test("invalid coordinates and coordinates paired with denied consent are rejected", async () => {
    records.clear();
    const invalidInputs = [
        { locationConsentStatus: "GRANTED", latitude: 91, longitude: 77 },
        { locationConsentStatus: "GRANTED", latitude: Number.NaN, longitude: 77 },
        { locationConsentStatus: "GRANTED", latitude: 12, longitude: Number.POSITIVE_INFINITY },
        { locationConsentStatus: "GRANTED", latitude: 12 }
    ];
    const invalidResults = await Promise.all(invalidInputs.map((input, index) =>
        invoke(`scan-location-invalid-${index}`, "signed-qr-payload", input)
    ));
    const inconsistent = await invoke("scan-location-denied-coordinates", "signed-qr-payload", {
        locationConsentStatus: "DENIED",
        latitude: 12,
        longitude: 77
    });
    assert.ok(invalidResults.every((result) => result.statusCode === 400));
    assert.equal(inconsistent.statusCode, 400);
    assert.equal(records.size, 0);
});

test("an idempotency retry cannot change consent or attach different coordinates", async () => {
    records.clear();
    const originalCoordinates = { latitude: 12, longitude: 77 };
    await invoke("scan-consent-bound", "signed-qr-payload", {
        locationConsentStatus: "GRANTED",
        ...originalCoordinates
    });
    const exactRetry = await invoke("scan-consent-bound", "signed-qr-payload", {
        locationConsentStatus: "GRANTED",
        ...originalCoordinates
    });
    const changedCoordinates = await invoke("scan-consent-bound", "signed-qr-payload", {
        locationConsentStatus: "GRANTED",
        latitude: 13,
        longitude: 78
    });
    const retry = await invoke("scan-consent-bound", "signed-qr-payload", {
        locationConsentStatus: "DENIED"
    });
    const saved = [...records.values()][0];
    assert.equal(exactRetry.statusCode, 200);
    assert.equal(changedCoordinates.statusCode, 409);
    assert.equal(retry.statusCode, 409);
    assert.equal(records.size, 1);
    assert.equal(saved.locationConsentStatus, "GRANTED");
    assert.deepEqual(saved.location, originalCoordinates);
});
