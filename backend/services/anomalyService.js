const Verification = require("../models/Verification");
const { scoreScanBehavior } = require("./aiService");

const emptyAnalysis = (scoringStatus, metrics = {}) => ({
    scanCount: metrics.scanCount ?? null,
    distinctLocations: metrics.distinctLocations ?? null,
    avgTimeBetweenScansHr: metrics.avgTimeBetweenScansHr ?? null,
    anomalyScore: null,
    isSuspicious: null,
    scoringStatus
});

// The Isolation Forest requires all three features. We only score after two
// scans have usable timestamps, every scan has coordinates, and the mean
// interval is positive. A first scan is deliberately never sent as interval 0.
const analyzeScanBehavior = async (
    productCode,
    { VerificationModel = Verification, score = scoreScanBehavior } = {}
) => {
    let scans;
    try {
        scans = await VerificationModel.find({ productCode, verificationType: "QR" })
            .sort({ createdAt: 1 })
            .lean();
    } catch {
        return emptyAnalysis("UNAVAILABLE");
    }

    const scanCount = scans.length;
    const validLocations = scans
        .filter((scan) => scan.locationConsentStatus === "GRANTED")
        .map((scan) => scan.location)
        .filter((location) =>
            typeof location?.latitude === "number" &&
            Number.isFinite(location.latitude) &&
            location.latitude >= -90 &&
            location.latitude <= 90 &&
            typeof location?.longitude === "number" &&
            Number.isFinite(location.longitude) &&
            location.longitude >= -180 &&
            location.longitude <= 180
        );
    const locationSet = new Set(validLocations.map((location) =>
        `${Number(location.latitude)},${Number(location.longitude)}`
    ));
    const distinctLocations = validLocations.length ? locationSet.size : null;

    const timestamps = scans
        .map((scan) => new Date(scan.createdAt).getTime())
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
    let avgTimeBetweenScansHr = null;
    if (timestamps.length >= 2) {
        const intervals = timestamps.slice(1).map((time, index) => time - timestamps[index]);
        const meanMs = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
        if (meanMs > 0) avgTimeBetweenScansHr = meanMs / (60 * 60 * 1000);
    }

    const metrics = {
        scanCount,
        distinctLocations,
        avgTimeBetweenScansHr: avgTimeBetweenScansHr === null
            ? null
            : Number(avgTimeBetweenScansHr.toFixed(4))
    };

    if (
        scanCount < 2 ||
        validLocations.length !== scanCount ||
        timestamps.length !== scanCount ||
        avgTimeBetweenScansHr === null
    ) {
        return emptyAnalysis("INSUFFICIENT_DATA", metrics);
    }

    try {
        const result = await score({
            scan_count: scanCount,
            distinct_locations: distinctLocations,
            avg_time_between_scans_hr: metrics.avgTimeBetweenScansHr
        });
        if (
            !result ||
            !Number.isFinite(result.anomaly_score) ||
            typeof result.is_suspicious !== "boolean"
        ) {
            return emptyAnalysis("UNAVAILABLE", metrics);
        }

        return {
            ...metrics,
            anomalyScore: result.anomaly_score,
            isSuspicious: result.is_suspicious,
            scoringStatus: "SCORED"
        };
    } catch {
        return emptyAnalysis("UNAVAILABLE", metrics);
    }
};

module.exports = { analyzeScanBehavior };
