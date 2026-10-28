const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeScanBehavior } = require("../services/anomalyService");

const buildModel = (scans) => ({
    find(query) {
        assert.deepEqual(query, { productCode: "FPD-TEST", verificationType: "QR" });
        return {
            sort() {
                return { lean: async () => scans };
            }
        };
    }
});

const scan = (hours, latitude = 10, longitude = 20) => ({
    createdAt: new Date(Date.UTC(2026, 0, 1) + hours * 60 * 60 * 1000),
    locationConsentStatus: "GRANTED",
    location: latitude === null ? undefined : { latitude, longitude }
});

test("scores sufficient history and maps the AI response", async () => {
    let features;
    const result = await analyzeScanBehavior("FPD-TEST", {
        VerificationModel: buildModel([scan(0), scan(12, 11, 21)]),
        score: async (input) => {
            features = input;
            return { anomaly_score: -0.27, is_suspicious: false };
        }
    });
    assert.deepEqual(features, {
        scan_count: 2,
        distinct_locations: 2,
        avg_time_between_scans_hr: 12
    });
    assert.equal(result.scoringStatus, "SCORED");
    assert.equal(result.scanCount, 2);
    assert.equal(result.anomalyScore, -0.27);
    assert.equal(result.isSuspicious, false);
});

test("first scan and insufficient history do not invent a zero-hour interval", async () => {
    let calls = 0;
    for (const scans of [[scan(0)], [scan(0), scan(0)]]) {
        const result = await analyzeScanBehavior("FPD-TEST", {
            VerificationModel: buildModel(scans),
            score: async () => { calls += 1; return {}; }
        });
        assert.equal(result.scoringStatus, "INSUFFICIENT_DATA");
        assert.equal(result.avgTimeBetweenScansHr, null);
        assert.equal(result.anomalyScore, null);
        assert.equal(result.isSuspicious, null);
    }
    assert.equal(calls, 0);
});

test("AI timeout or connection refusal is unavailable, not a negative result", async () => {
    const result = await analyzeScanBehavior("FPD-TEST", {
        VerificationModel: buildModel([scan(0), scan(8)]),
        score: async () => { throw Object.assign(new Error("down"), { code: "ECONNREFUSED" }); }
    });
    assert.equal(result.scoringStatus, "UNAVAILABLE");
    assert.equal(result.scanCount, 2);
    assert.equal(result.isSuspicious, null);
});

test("invalid AI responses are unavailable", async () => {
    const result = await analyzeScanBehavior("FPD-TEST", {
        VerificationModel: buildModel([scan(0), scan(4)]),
        score: async () => ({ anomaly_score: "not-a-number", is_suspicious: false })
    });
    assert.equal(result.scoringStatus, "UNAVAILABLE");
    assert.equal(result.anomalyScore, null);
    assert.equal(result.isSuspicious, null);
});

test("missing coordinates are not invented and prevent scoring", async () => {
    let called = false;
    const result = await analyzeScanBehavior("FPD-TEST", {
        VerificationModel: buildModel([scan(0), scan(10, null)]),
        score: async () => { called = true; return { anomaly_score: 0, is_suspicious: false }; }
    });
    assert.equal(result.distinctLocations, 1);
    assert.equal(result.scoringStatus, "INSUFFICIENT_DATA");
    assert.equal(called, false);
});

test("repeated coordinates count as one location", async () => {
    const result = await analyzeScanBehavior("FPD-TEST", {
        VerificationModel: buildModel([scan(0, 10, 20), scan(10, 10, 20)]),
        score: async () => ({ anomaly_score: 0.12, is_suspicious: false })
    });
    assert.equal(result.distinctLocations, 1);
    assert.equal(result.scoringStatus, "SCORED");
});

test("distinct coordinates are counted and a suspicious model result is preserved", async () => {
    const result = await analyzeScanBehavior("FPD-TEST", {
        VerificationModel: buildModel([scan(0), scan(2, 11, 21), scan(4, 12, 22)]),
        score: async () => ({ anomaly_score: -0.8, is_suspicious: true })
    });
    assert.equal(result.distinctLocations, 3);
    assert.equal(result.scoringStatus, "SCORED");
    assert.equal(result.isSuspicious, true);
});

test("legacy coordinates without a recorded grant are not used for scoring", async () => {
    let called = false;
    const legacyScans = [scan(0), scan(10, 11, 21)].map(({ location, ...record }) => ({ ...record, location }));
    legacyScans.forEach((record) => { delete record.locationConsentStatus; });
    const result = await analyzeScanBehavior("FPD-TEST", {
        VerificationModel: buildModel(legacyScans),
        score: async () => { called = true; return { anomaly_score: 0, is_suspicious: false }; }
    });
    assert.equal(result.distinctLocations, null);
    assert.equal(result.scoringStatus, "INSUFFICIENT_DATA");
    assert.equal(called, false);
});

test("out-of-range consented coordinates are not used as locations", async () => {
    const result = await analyzeScanBehavior("FPD-TEST", {
        VerificationModel: buildModel([scan(0, 95, 20), scan(10, 10, 20)]),
        score: async () => ({ anomaly_score: 0, is_suspicious: false })
    });
    assert.equal(result.distinctLocations, 1);
    assert.equal(result.scoringStatus, "INSUFFICIENT_DATA");
});
