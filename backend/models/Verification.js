const mongoose = require("mongoose");

const verificationSchema = new mongoose.Schema(
    {
        // =====================================================
        // PRODUCT
        // =====================================================

        productCode: {
            type: String,
            required: true,
            trim: true
        },

        // =====================================================
        // VERIFICATION TYPE
        // =====================================================

        verificationType: {
            type: String,
            enum: ["QR", "MANUAL_CODE", "IMAGE"],
            required: true
        },

        // =====================================================
        // VERIFICATION RESULT
        // =====================================================

        status: {
            type: String,
            enum: [
                "GENUINE",
                "SUSPICIOUS",
                "FAKE",
                "NOT_REGISTERED",
                "DEACTIVATED",
                "FLAGGED",
                "INVALID_QR",
                "INVALID_PRODUCT_CODE",
                "REGISTRY_UNAVAILABLE",
                "REGISTRY_UNRESOLVED",
                "AI_UNAVAILABLE"
            ],
            required: true
        },

        scoringStatus: {
            type: String,
            enum: ["SCORED", "INSUFFICIENT_DATA", "UNAVAILABLE", "NOT_APPLICABLE"],
            default: "NOT_APPLICABLE"
        },

        // Stable per HTTP scan attempt; a retried request reuses its record.
        scanRequestId: {
            type: String,
            index: { unique: true, sparse: true }
        },

        scanRequestFingerprint: {
            type: String,
            select: false
        },

        // =====================================================
        // AI IMAGE RESULT
        // =====================================================

        similarity: {
            type: Number,
            default: null
        },

        aiConfidence: {
            type: Number,
            default: null
        },

        // =====================================================
        // SCAN BEHAVIOUR / ISOLATION FOREST
        // =====================================================

        scanCount: {
            type: Number,
            default: null
        },

        distinctLocations: {
            type: Number,
            default: null
        },

        avgTimeBetweenScansHr: {
            type: Number,
            default: null
        },

        anomalyScore: {
            type: Number,
            default: null
        },

        isSuspicious: {
            type: Boolean,
            default: null
        },

        // =====================================================
        // LOCATION
        // =====================================================

        location: {
            latitude: {
                type: Number
            },

            longitude: {
                type: Number
            }
        },

        // Consent belongs to this verification attempt. Legacy records remain
        // unset/unknown and are never treated as consented retroactively.
        locationConsentStatus: {
            type: String,
            enum: ["GRANTED", "DENIED", "NOT_REQUESTED", "UNKNOWN"]
        },
    },
    {
        timestamps: true
    }
);

verificationSchema.pre("validate", function validateLocationConsent() {
    // Do not make an old document fail validation merely because it is being
    // saved for an unrelated field; only enforce this invariant for new or
    // explicitly changed location/consent values.
    if (
        !this.isNew &&
        !this.isModified("location") &&
        !this.isModified("locationConsentStatus")
    ) {
        return;
    }

    const latitude = this.location?.latitude;
    const longitude = this.location?.longitude;
    const hasLatitude = latitude !== undefined && latitude !== null;
    const hasLongitude = longitude !== undefined && longitude !== null;
    if (!hasLatitude && !hasLongitude) return;

    if (
        !hasLatitude || !hasLongitude ||
        !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    ) {
        this.invalidate("location", "Location coordinates must be a valid latitude/longitude pair");
    }
    if (this.locationConsentStatus !== "GRANTED") {
        this.invalidate("locationConsentStatus", "Coordinates require explicit location consent");
    }
});

module.exports =
    mongoose.model("Verification", verificationSchema);
