const Manufacturer = require("../models/Manufacturer");
const Product = require("../models/Product");
const User = require("../models/User");
const SupplyChainPartner = require("../models/SupplyChainPartner");
const Verification = require("../models/Verification");
const productRegistrationService = require("../services/productRegistrationService");
const SCAN_SCORING_STATES = ["SCORED", "INSUFFICIENT_DATA", "UNAVAILABLE"];
const VERIFICATION_TYPES = ["QR", "MANUAL_CODE", "IMAGE"];
const VERIFICATION_STATUSES = [
    "GENUINE", "SUSPICIOUS", "FAKE", "AI_UNAVAILABLE", "NOT_REGISTERED",
    "DEACTIVATED", "FLAGGED", "INVALID_QR", "INVALID_PRODUCT_CODE",
    "REGISTRY_UNAVAILABLE", "REGISTRY_UNRESOLVED"
];
const SCORING_STATUSES = [...SCAN_SCORING_STATES, "NOT_APPLICABLE"];
const ADMIN_VERIFICATION_SELECT = [
    "productCode", "verificationType", "status", "scoringStatus",
    "scanCount", "distinctLocations", "avgTimeBetweenScansHr",
    "anomalyScore", "isSuspicious", "similarity", "aiConfidence", "createdAt"
].join(" ");

const parsePageValue = (value, name, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
    if (value === undefined || value === "") return fallback;
    if (!/^\d+$/.test(String(value))) {
        const error = new Error(`${name} must be a positive integer`);
        error.statusCode = 400;
        throw error;
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
        const error = new Error(`${name} is outside the supported range`);
        error.statusCode = 400;
        throw error;
    }
    return parsed;
};

const parseDashboardPages = (query = {}) => {
    const pageSize = parsePageValue(query.pageSize, "pageSize", 20, 100);
    return {
        pageSize,
        products: parsePageValue(query.productPage, "productPage", 1),
        manufacturers: parsePageValue(query.manufacturerPage, "manufacturerPage", 1),
        recentVerifications: parsePageValue(query.recentPage, "recentPage", 1),
        alerts: parsePageValue(query.alertPage, "alertPage", 1)
    };
};

const parseVerificationFilters = (query = {}) => {
    const filter = {};
    const type = String(query.type || "").trim().toUpperCase();
    const status = String(query.status || "").trim().toUpperCase();
    const scoringStatus = String(query.scoringStatus || "").trim().toUpperCase();
    const productCode = String(query.productCode || "").trim();

    if (type && !VERIFICATION_TYPES.includes(type)) {
        const error = new Error("type must be QR, MANUAL_CODE, or IMAGE");
        error.statusCode = 400;
        throw error;
    }
    if (status && !VERIFICATION_STATUSES.includes(status)) {
        const error = new Error("status is not a supported verification result");
        error.statusCode = 400;
        throw error;
    }
    if (scoringStatus && !SCORING_STATUSES.includes(scoringStatus)) {
        const error = new Error("scoringStatus is not a supported schema value");
        error.statusCode = 400;
        throw error;
    }
    if (productCode.length > 64) {
        const error = new Error("productCode is too long");
        error.statusCode = 400;
        throw error;
    }

    if (type) filter.verificationType = type;
    if (status) filter.status = status;
    if (scoringStatus) filter.scoringStatus = scoringStatus;
    if (productCode) filter.productCode = productCode;
    return filter;
};

const listAdminVerifications = async ({ filter, page, pageSize }) => {
    const [records, total] = await Promise.all([
        Verification.find(filter)
            .select(ADMIN_VERIFICATION_SELECT)
            .sort({ createdAt: -1, _id: -1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .lean(),
        Verification.countDocuments(filter)
    ]);

    const productCodes = [...new Set(records.map((record) => record.productCode))];
    const productRecords = productCodes.length
        ? await Product.find({ productCode: { $in: productCodes } })
            .select("productCode productName brandName category manufacturerId productHash transactionHash mintedAt")
            .populate("manufacturerId", "companyName")
            .lean()
        : [];
    const productsByCode = new Map(productRecords.map((product) => [product.productCode, product]));
    const verifications = records.map((record) => {
        const product = productsByCode.get(record.productCode);
        return {
            ...record,
            product: product ? {
                productCode: product.productCode,
                productName: product.productName,
                brandName: product.brandName,
                category: product.category,
                manufacturer: product.manufacturerId?.companyName || null,
                productHash: product.productHash,
                transactionHash: product.transactionHash,
                mintedAt: product.mintedAt
            } : null
        };
    });

    return {
        verifications,
        pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize)
        }
    };
};
// =====================================================
// GET PENDING MANUFACTURERS
// =====================================================
const getPendingManufacturers = async (req, res) => {
    try {
        const manufacturers = await Manufacturer.find({
            verificationStatus: "PENDING"
        })
            .populate("userId", "name email status")
            .sort({ createdAt: -1 });

        res.status(200).json({
            count: manufacturers.length,
            manufacturers
        });

    } catch (error) {
        console.error(
            "Get pending manufacturers error:",
            error
        );

        res.status(500).json({
            message: "Server error while fetching manufacturers"
        });
    }
};


// =====================================================
// APPROVE MANUFACTURER
// =====================================================

const approveManufacturer = async (req, res) => {
    try {
        const { id } = req.params;

        const manufacturer =
            await Manufacturer.findById(id);

        if (!manufacturer) {
            return res.status(404).json({
                message: "Manufacturer not found"
            });
        }

        if (
            manufacturer.verificationStatus !==
            "PENDING"
        ) {
            return res.status(400).json({
                message:
                    `Manufacturer is already ${manufacturer.verificationStatus.toLowerCase()}`
            });
        }

        manufacturer.verificationStatus = "VERIFIED";
        manufacturer.verifiedBy = req.user.userId;
        manufacturer.verifiedAt = new Date();

        await manufacturer.save();

        await User.findByIdAndUpdate(
            manufacturer.userId,
            {
                status: "ACTIVE"
            }
        );

        res.status(200).json({
            message:
                "Manufacturer approved successfully",
            manufacturerId:
                manufacturer._id,
            verificationStatus:
                manufacturer.verificationStatus
        });

    } catch (error) {
        console.error(
            "Approve manufacturer error:",
            error
        );

        res.status(500).json({
            message:
                "Server error while approving manufacturer"
        });
    }
};


// =====================================================
// REJECT MANUFACTURER
// =====================================================

const rejectManufacturer = async (req, res) => {
    try {
        const { id } = req.params;

        const manufacturer =
            await Manufacturer.findById(id);

        if (!manufacturer) {
            return res.status(404).json({
                message: "Manufacturer not found"
            });
        }

        if (
            manufacturer.verificationStatus !==
            "PENDING"
        ) {
            return res.status(400).json({
                message:
                    `Manufacturer is already ${manufacturer.verificationStatus.toLowerCase()}`
            });
        }

        manufacturer.verificationStatus =
            "REJECTED";

        await manufacturer.save();

        await User.findByIdAndUpdate(
            manufacturer.userId,
            {
                status: "REJECTED"
            }
        );

        res.status(200).json({
            message:
                "Manufacturer rejected successfully",
            manufacturerId:
                manufacturer._id,
            verificationStatus:
                manufacturer.verificationStatus
        });

    } catch (error) {
        console.error(
            "Reject manufacturer error:",
            error
        );

        res.status(500).json({
            message:
                "Server error while rejecting manufacturer"
        });
    }
};

// =====================================================
// GET PENDING DISTRIBUTORS AND RETAILERS
// =====================================================

const getPendingPartners = async (req, res) => {
    try {
        const partners = await SupplyChainPartner.find({
            verificationStatus: "PENDING"
        })
            .populate("userId", "name email status")
            .sort({ createdAt: -1 });

        res.status(200).json({
            count: partners.length,
            partners
        });

    } catch (error) {
        console.error(
            "Get pending partners error:",
            error
        );

        res.status(500).json({
            message: "Server error while fetching partners"
        });
    }
};

// =====================================================
// APPROVE DISTRIBUTOR / RETAILER
// =====================================================

const approvePartner = async (req, res) => {
    try {
        const { id } = req.params;

        const partner = await SupplyChainPartner.findById(id);

        if (!partner) {
            return res.status(404).json({
                message: "Partner not found"
            });
        }

        if (partner.verificationStatus !== "PENDING") {
            return res.status(400).json({
                message:
                    `Partner is already ${partner.verificationStatus.toLowerCase()}`
            });
        }

        partner.verificationStatus = "VERIFIED";
        partner.verifiedBy = req.user.userId;
        partner.verifiedAt = new Date();

        await partner.save();

        await User.findByIdAndUpdate(
            partner.userId,
            {
                status: "ACTIVE"
            }
        );

        res.status(200).json({
            message:
                `${partner.partnerType} approved successfully`,
            partnerId: partner._id,
            partnerType: partner.partnerType,
            verificationStatus:
                partner.verificationStatus
        });

    } catch (error) {
        console.error(
            "Approve partner error:",
            error
        );

        res.status(500).json({
            message:
                "Server error while approving partner"
        });
    }
};
// =====================================================
// REJECT DISTRIBUTOR / RETAILER
// =====================================================

const rejectPartner = async (req, res) => {
    try {
        const { id } = req.params;

        const partner = await SupplyChainPartner.findById(id);

        if (!partner) {
            return res.status(404).json({
                message: "Partner not found"
            });
        }

        if (partner.verificationStatus !== "PENDING") {
            return res.status(400).json({
                message:
                    `Partner is already ${partner.verificationStatus.toLowerCase()}`
            });
        }

        partner.verificationStatus = "REJECTED";

        await partner.save();

        await User.findByIdAndUpdate(
            partner.userId,
            {
                status: "REJECTED"
            }
        );

        res.status(200).json({
            message:
                `${partner.partnerType} rejected successfully`,
            partnerId: partner._id,
            partnerType: partner.partnerType,
            verificationStatus:
                partner.verificationStatus
        });

    } catch (error) {
        console.error(
            "Reject partner error:",
            error
        );

        res.status(500).json({
            message:
                "Server error while rejecting partner"
        });
    }
};
// =====================================================
// GET ADMIN DASHBOARD DATA
// =====================================================

const getAdminDashboardLegacy = async (req, res) => {
    try {

        // -------------------------------------------------
        // BASIC COUNTS
        // -------------------------------------------------

        const [
            
            totalScans,
            qrScans,
            imageVerifications,
            manualCodeLookups,
            genuineScans,
            suspiciousScans,
            fakeScans,
            totalManufacturers,
            pendingManufacturers,
            verifiedManufacturers,
            rejectedManufacturers,
            suspendedManufacturers
        ] = await Promise.all([

          
            Verification.countDocuments(),

            Verification.countDocuments({ verificationType: "QR" }),

            Verification.countDocuments({ verificationType: "IMAGE" }),

            Verification.countDocuments({ verificationType: "MANUAL_CODE" }),

            Verification.countDocuments({
                status: "GENUINE"
            }),

            Verification.countDocuments({
                status: "SUSPICIOUS"
            }),

            Verification.countDocuments({
                status: "FAKE"
            }),

            Manufacturer.countDocuments(),

            Manufacturer.countDocuments({
                verificationStatus: "PENDING"
            }),

            Manufacturer.countDocuments({
                verificationStatus: "VERIFIED"
            }),

            Manufacturer.countDocuments({
                verificationStatus: "REJECTED"
            }),

            Manufacturer.countDocuments({
                verificationStatus: "SUSPENDED"
            })
        ]);


        // -------------------------------------------------
        // ALL MANUFACTURERS
        // -------------------------------------------------

        const manufacturers =
            await Manufacturer.find()
                .populate(
                    "userId",
                    "name email status"
                )
                .sort({
                    createdAt: -1
                });


        // -------------------------------------------------
        // ALL PRODUCTS
        // -------------------------------------------------

        const products = await productRegistrationService.listAllProducts();

        const totalProducts = products.length;


        // -------------------------------------------------
        // RECENT VERIFICATIONS
        // -------------------------------------------------

        const recentVerifications =
    await Verification.find()
        .sort({
            createdAt: -1
        })
        .limit(50)
        .lean();


        // -------------------------------------------------
        // COUNTERFEIT / SUSPICIOUS ACTIVITY
        // -------------------------------------------------

        const alerts =
    await Verification.find({
        status: {
            $in: [
                "FAKE",
                "SUSPICIOUS",
                "INVALID_QR",
                "FLAGGED"
            ]
        }
    })
        .sort({
            createdAt: -1
        })
        .limit(50)
        .lean();

        // -------------------------------------------------
        // SCAN BEHAVIOUR SCORING STATUS
        // -------------------------------------------------

        const scoringStatusRows = await Verification.aggregate([
            {
                $match: {
                    verificationType: "QR",
                    scoringStatus: { $in: SCAN_SCORING_STATES }
                }
            },
            {
                $group: {
                    _id: "$scoringStatus",
                    count: { $sum: 1 }
                }
            }
        ]);
        const scoringStatusCounts = Object.fromEntries(
            SCAN_SCORING_STATES.map((state) => [state, 0])
        );
        scoringStatusRows.forEach(({ _id, count }) => {
            if (Object.hasOwn(scoringStatusCounts, _id)) {
                scoringStatusCounts[_id] = count;
            }
        });

        // -------------------------------------------------
        // MAP LOCATIONS
        // -------------------------------------------------
        //
        // Multiple scans can happen at the same
        // coordinates. We group them together.
        //
        // -------------------------------------------------

        const locations =
            await Verification.aggregate([

                {
                    $match: {
                        locationConsentStatus: "GRANTED",
                        "location.latitude": {
                            $type: "number",
                            $gte: -90,
                            $lte: 90
                        },
                        "location.longitude": {
                            $type: "number",
                            $gte: -180,
                            $lte: 180
                        }
                    }
                },

                {
                    $group: {
                        _id: {
                            latitude:
                                "$location.latitude",

                            longitude:
                                "$location.longitude"
                        },

                        scans: {
                            $sum: 1
                        },

                        genuine: {
                            $sum: {
                                $cond: [
                                    {
                                        $eq: [
                                            "$status",
                                            "GENUINE"
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        },

                        suspicious: {
                            $sum: {
                                $cond: [
                                    {
                                        $eq: [
                                            "$status",
                                            "SUSPICIOUS"
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        },

                        fake: {
                            $sum: {
                                $cond: [
                                    {
                                        $eq: [
                                            "$status",
                                            "FAKE"
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        },

                        lastScan: {
                            $max: "$createdAt"
                        }
                    }
                },

                {
                    $project: {
                        _id: 0,

                        latitude:
                            "$_id.latitude",

                        longitude:
                            "$_id.longitude",

                        scans: 1,

                        genuine: 1,

                        suspicious: 1,

                        fake: 1,

                        lastScan: 1
                    }
                },

                {
                    $sort: {
                        scans: -1
                    }
                }
            ]);

        const validLocationScans = locations.reduce(
            (total, location) => total + location.scans,
            0
        );

        // -------------------------------------------------
        // VERIFICATION ACTIVITY BY DAY
        // -------------------------------------------------

        const verificationActivity =
            await Verification.aggregate([

                {
                    $group: {
                        _id: {
                            date: {
                                $dateToString: {
                                    format:
                                        "%Y-%m-%d",
                                    date:
                                        "$createdAt"
                                }
                            },

                            status:
                                "$status"
                        },

                        count: {
                            $sum: 1
                        }
                    }
                },

                {
                    $sort: {
                        "_id.date": 1
                    }
                }
            ]);


        // -------------------------------------------------
        // BLOCKCHAIN INFORMATION
        // -------------------------------------------------
        //
        // Product records are indexed from MongoDB after
        // the confirmed mint and include the transaction hash.
        //
        // -------------------------------------------------

        const blockchainRecords =
    products.map(product => ({

        productCode:
            product.productCode,

        productName:
            product.productName,

        blockchainHash:
            product.productHash,

        transactionHash:
            product.transactionHash,

        imageHash:
            product.imageHash,

        ipfsImageHash:
            product.ipfsImageHash,

        qrHash:
            product.qrHash,

        manufacturer:
            product.manufacturer,

        timestamp:
            product.timestamp
    }));

        // -------------------------------------------------
        // SEND EVERYTHING TO FRONTEND
        // -------------------------------------------------

        res.status(200).json({

            success: true,

            stats: {

                totalProducts,

                totalScans,

                qrScans,

                imageVerifications,

                scoringStatusCounts,

                validLocationScans,

                genuineScans,

                suspiciousScans,

                fakeScans,

                totalManufacturers,

                pendingManufacturers,

                verifiedManufacturers,

                rejectedManufacturers,

                suspendedManufacturers
            },


            manufacturers,

            products,

            recentVerifications,

            alerts,

            locations,

            verificationActivity,

            blockchainRecords
        });

    } catch (error) {

        console.error(
            "Admin dashboard error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Server error while loading admin dashboard"
        });
    }
};

const getAdminDashboard = async (req, res) => {
    try {
        const pages = parseDashboardPages(req.query || {});
        const pageSize = pages.pageSize;
        const productPage = await productRegistrationService.listAllProductsPaginated({
            page: pages.products,
            pageSize
        });

        const manufacturerFilter = {};
        const [
            totalScans,
            qrScans,
            imageVerifications,
            manualCodeLookups,
            genuineScans,
            suspiciousScans,
            fakeScans,
            totalManufacturers,
            pendingManufacturers,
            verifiedManufacturers,
            rejectedManufacturers,
            suspendedManufacturers,
            manufacturerRecords,
            scoringStatusRows,
            verificationActivity
        ] = await Promise.all([
            Verification.countDocuments(),
            Verification.countDocuments({ verificationType: "QR" }),
            Verification.countDocuments({ verificationType: "IMAGE" }),
            Verification.countDocuments({ verificationType: "MANUAL_CODE" }),
            Verification.countDocuments({ status: "GENUINE" }),
            Verification.countDocuments({ status: "SUSPICIOUS" }),
            Verification.countDocuments({ status: "FAKE" }),
            Manufacturer.countDocuments(),
            Manufacturer.countDocuments({ verificationStatus: "PENDING" }),
            Manufacturer.countDocuments({ verificationStatus: "VERIFIED" }),
            Manufacturer.countDocuments({ verificationStatus: "REJECTED" }),
            Manufacturer.countDocuments({ verificationStatus: "SUSPENDED" }),
            Manufacturer.find(manufacturerFilter)
                .populate("userId", "name email status")
                .sort({ createdAt: -1, _id: -1 })
                .skip((pages.manufacturers - 1) * pageSize)
                .limit(pageSize)
                .lean(),
            Verification.aggregate([
                { $match: { verificationType: "QR", scoringStatus: { $in: SCAN_SCORING_STATES } } },
                { $group: { _id: "$scoringStatus", count: { $sum: 1 } } }
            ]),
            Verification.aggregate([
                { $match: { createdAt: { $gte: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000) } } },
                {
                    $group: {
                        _id: {
                            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                            status: "$status",
                            verificationType: "$verificationType"
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { "_id.date": 1 } }
            ])
        ]);

        const locations = await Verification.aggregate([
            {
                $match: {
                    locationConsentStatus: "GRANTED",
                    "location.latitude": { $type: "number", $gte: -90, $lte: 90 },
                    "location.longitude": { $type: "number", $gte: -180, $lte: 180 }
                }
            },
            {
                $group: {
                    _id: {
                        latitude: "$location.latitude",
                        longitude: "$location.longitude"
                    },
                    scans: { $sum: 1 },
                    genuine: { $sum: { $cond: [{ $eq: ["$status", "GENUINE"] }, 1, 0] } },
                    suspicious: { $sum: { $cond: [{ $eq: ["$status", "SUSPICIOUS"] }, 1, 0] } },
                    fake: { $sum: { $cond: [{ $eq: ["$status", "FAKE"] }, 1, 0] } },
                    lastScan: { $max: "$createdAt" }
                }
            },
            {
                $project: {
                    _id: 0,
                    latitude: "$_id.latitude",
                    longitude: "$_id.longitude",
                    scans: 1,
                    genuine: 1,
                    suspicious: 1,
                    fake: 1,
                    lastScan: 1
                }
            },
            { $sort: { scans: -1 } }
        ]);
        const validLocationScans = locations.reduce((total, point) => total + point.scans, 0);

        const manufacturerIds = manufacturerRecords.map((manufacturer) => manufacturer._id);
        const manufacturerProductCounts = manufacturerIds.length
            ? await Product.aggregate([
                { $match: { manufacturerId: { $in: manufacturerIds } } },
                { $group: { _id: "$manufacturerId", productCount: { $sum: 1 } } }
            ])
            : [];
        const productCountsByManufacturer = new Map(
            manufacturerProductCounts.map((row) => [String(row._id), row.productCount])
        );
        const manufacturers = manufacturerRecords.map((manufacturer) => ({
            ...manufacturer,
            productCount: productCountsByManufacturer.get(String(manufacturer._id)) || 0
        }));

        const scoringStatusCounts = Object.fromEntries(
            SCAN_SCORING_STATES.map((state) => [state, 0])
        );
        scoringStatusRows.forEach(({ _id, count }) => {
            if (Object.hasOwn(scoringStatusCounts, _id)) scoringStatusCounts[_id] = count;
        });

        const [recentPage, alertPage] = await Promise.all([
            listAdminVerifications({
                filter: {},
                page: pages.recentVerifications,
                pageSize
            }),
            listAdminVerifications({
                filter: {
                    $or: [
                        { status: { $in: ["FAKE", "SUSPICIOUS", "INVALID_QR", "FLAGGED"] } },
                        { scoringStatus: "SCORED", isSuspicious: true }
                    ]
                },
                page: pages.alerts,
                pageSize
            })
        ]);

        const blockchainRecords = productPage.products.map((product) => ({
            productCode: product.productCode,
            productName: product.productName,
            blockchainHash: product.productHash,
            transactionHash: product.transactionHash,
            imageHash: product.imageHash,
            ipfsImageHash: product.ipfsImageHash,
            manufacturer: product.manufacturer,
            timestamp: product.timestamp,
            source: "MONGODB_PRODUCT_RECORD"
        }));

        return res.status(200).json({
            success: true,
            stats: {
                totalProducts: productPage.pagination.total,
                totalScans,
                qrScans,
                imageVerifications,
                manualCodeLookups,
                genuineScans,
                suspiciousScans,
                fakeScans,
                scoringStatusCounts,
                validLocationScans,
                totalManufacturers,
                pendingManufacturers,
                verifiedManufacturers,
                rejectedManufacturers,
                suspendedManufacturers
            },
            manufacturers,
            products: productPage.products,
            recentVerifications: recentPage.verifications,
            alerts: alertPage.verifications,
            locations,
            locationDataAvailability: {
                available: locations.length > 0,
                reason: locations.length > 0
                    ? null
                    : "No scans with valid coordinates and recorded location consent are available. Legacy coordinates without consent remain withheld."
            },
            verificationActivity,
            blockchainRecords,
            pagination: {
                products: productPage.pagination,
                manufacturers: {
                    page: pages.manufacturers,
                    pageSize,
                    total: totalManufacturers,
                    totalPages: Math.ceil(totalManufacturers / pageSize)
                },
                recentVerifications: recentPage.pagination,
                alerts: alertPage.pagination
            }
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : "Server error while loading admin dashboard"
        });
    }
};

const getAdminVerifications = async (req, res) => {
    try {
        const page = parsePageValue(req.query?.page, "page", 1);
        const pageSize = parsePageValue(req.query?.pageSize, "pageSize", 20, 100);
        const filter = parseVerificationFilters(req.query || {});
        const result = await listAdminVerifications({ filter, page, pageSize });
        return res.status(200).json({ success: true, ...result, filters: filter });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : "Server error while loading verification records"
        });
    }
};


// =====================================================
// EXPORT
// =====================================================

module.exports = {

    getPendingManufacturers,

    approveManufacturer,

    rejectManufacturer,

    getPendingPartners,

    approvePartner,

    rejectPartner,

    getAdminDashboard,

    getAdminVerifications

};
