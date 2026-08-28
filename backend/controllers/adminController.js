const Manufacturer = require("../models/Manufacturer");
const User = require("../models/User");
const Product = require("../models/Product");
const Verification = require("../models/Verification");


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
// GET ADMIN DASHBOARD DATA
// =====================================================

const getAdminDashboard = async (req, res) => {
    try {

        // -------------------------------------------------
        // BASIC COUNTS
        // -------------------------------------------------

        const [
            totalProducts,
            totalScans,
            genuineScans,
            suspiciousScans,
            fakeScans,
            totalManufacturers,
            pendingManufacturers,
            verifiedManufacturers,
            rejectedManufacturers,
            suspendedManufacturers
        ] = await Promise.all([

            Product.countDocuments(),

            Verification.countDocuments(),

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

        const products =
            await Product.find()
                .populate(
                    {
                        path: "manufacturerId",
                        select:
                            "companyName registrationNumber verificationStatus"
                    }
                )
                .sort({
                    createdAt: -1
                });


        // -------------------------------------------------
        // RECENT VERIFICATIONS
        // -------------------------------------------------

        const recentVerifications =
            await Verification.find()
                .populate(
                    {
                        path: "productId",
                        select:
                            "productName category brandName"
                    }
                )
                .sort({
                    createdAt: -1
                })
                .limit(50);


        // -------------------------------------------------
        // COUNTERFEIT / SUSPICIOUS ACTIVITY
        // -------------------------------------------------

        const alerts =
            await Verification.find({
                status: {
                    $in: [
                        "FAKE",
                        "SUSPICIOUS"
                    ]
                }
            })
                .populate(
                    {
                        path: "productId",
                        select:
                            "productName category brandName"
                    }
                )
                .sort({
                    createdAt: -1
                })
                .limit(50);


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
        // Your Product model currently stores the
        // blockchainHash.
        //
        // The transaction hash returned during product
        // registration is NOT currently stored in Product.
        //
        // Therefore we expose the blockchain hash here
        // rather than inventing transaction data.
        //
        // -------------------------------------------------

        const blockchainRecords =
            products
                .filter(
                    product =>
                        product.blockchainHash
                )
                .map(product => ({
                    productCode:
                        product.productCode,

                    productName:
                        product.productName,

                    blockchainHash:
                        product.blockchainHash,

                    manufacturer:
                        product.manufacturerId
                            ?.companyName ||
                        "Unknown",

                    createdAt:
                        product.createdAt
                }));


        // -------------------------------------------------
        // SEND EVERYTHING TO FRONTEND
        // -------------------------------------------------

        res.status(200).json({

            success: true,

            stats: {

                totalProducts,

                totalScans,

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


// =====================================================
// EXPORT
// =====================================================

module.exports = {

    getPendingManufacturers,

    approveManufacturer,

    rejectManufacturer,

    getAdminDashboard

};