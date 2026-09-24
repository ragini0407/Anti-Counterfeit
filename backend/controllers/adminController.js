const Manufacturer = require("../models/Manufacturer");
const User = require("../models/User");
const Verification = require("../models/Verification");
const Product = require("../models/Product");
const { Wallet } = require("ethers");
// =====================================================
// GET PENDING MANUFACTURERS
// =====================================================
const {
    getProductFromBlockchain,
    getManufacturerProducts
} = require("../services/blockchainService");
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

        // -------------------------------------------------
// ALL PRODUCTS FROM BLOCKCHAIN
// -------------------------------------------------

const manufacturerWallet = new Wallet(
    process.env.MANUFACTURER_PRIVATE_KEY
);

const productCodes = await getManufacturerProducts(
    manufacturerWallet.address
);

const products = [];

for (const productCode of productCodes) {
    try {
        const product =
            await getProductFromBlockchain(productCode);
        console.log(
    "BLOCKCHAIN STATUS:",
    product.productId,
    product.status,
    Number(product.status)
);
        const totalScans =
            await Verification.countDocuments({
                productCode: String(productCode)
            });

       const statusNumber = Number(product.status);

products.push({
    productCode: product.productId,

    productName: product.productName,

    category: product.category,

    brandName: product.brandName,

    batchNumber: product.batchNumber,

    manufacturingDate:
        product.manufacturingDate,

    manufacturer:
        product.manufacturer,

    productHash:
        product.productHash,

    imageHash:
        product.imageHash,

    qrHash:
        product.qrHash,

    timestamp:
        product.timestamp
            ? product.timestamp.toString()
            : null,

    status:
    statusNumber === 1
        ? "GENUINE"
        : statusNumber === 2
            ? "SUSPICIOUS"
            : statusNumber === 3
                ? "DEACTIVATED"
                : "UNKNOWN",

    totalScans
});

    } catch (productError) {
        console.error(
            `Could not fetch blockchain product ${productCode}:`,
            productError.message
        );
    }
}

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
    products.map(product => ({

        productCode:
            product.productCode,

        productName:
            product.productName,

        blockchainHash:
            product.productHash,

        imageHash:
            product.imageHash,

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