const test = require("node:test");
const assert = require("node:assert/strict");
const Verification = require("../models/Verification");

const baseScan = (overrides = {}) => new Verification({
    productCode: "FPD-CONSENT-TEST",
    verificationType: "QR",
    status: "GENUINE",
    ...overrides
});

test("new verification coordinates require explicit granted consent and valid ranges", async () => {
    const granted = baseScan({
        locationConsentStatus: "GRANTED",
        location: { latitude: 12.9, longitude: 77.5 }
    });
    await granted.validate();

    for (const overrides of [
        { locationConsentStatus: "DENIED", location: { latitude: 12, longitude: 77 } },
        { location: { latitude: 12, longitude: 77 } },
        { locationConsentStatus: "GRANTED", location: { latitude: 91, longitude: 77 } },
        { locationConsentStatus: "GRANTED", location: { latitude: 12, longitude: Number.POSITIVE_INFINITY } },
        { locationConsentStatus: "GRANTED", location: { latitude: 12 } }
    ]) {
        await assert.rejects(baseScan(overrides).validate());
    }
});

test("a legacy record without consent can be saved for an unrelated field without granting consent", async () => {
    const legacy = Verification.hydrate({
        _id: "507f1f77bcf86cd799439011",
        productCode: "FPD-LEGACY-TEST",
        verificationType: "QR",
        status: "GENUINE",
        location: { latitude: 12, longitude: 77 }
    });
    legacy.scoringStatus = "UNAVAILABLE";
    await legacy.validate();
    assert.equal(legacy.locationConsentStatus, undefined);
    assert.equal(legacy.location.latitude, 12);
});

test("no location can be recorded when consent was denied or not requested", async () => {
    await baseScan({ locationConsentStatus: "DENIED" }).validate();
    await baseScan({ locationConsentStatus: "NOT_REQUESTED" }).validate();
    await baseScan({ locationConsentStatus: "UNKNOWN" }).validate();
});
