const Manufacturer = require("../models/Manufacturer");
const User = require("../models/User");
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
        console.error("Get pending manufacturers error:", error);

        res.status(500).json({
            message: "Server error while fetching manufacturers"
        });
    }
};
const approveManufacturer = async (req, res) => {
    try {
        const { id } = req.params;

        const manufacturer = await Manufacturer.findById(id);

        if (!manufacturer) {
            return res.status(404).json({
                message: "Manufacturer not found"
            });
        }

        if (manufacturer.verificationStatus !== "PENDING") {
            return res.status(400).json({
                message: `Manufacturer is already ${manufacturer.verificationStatus.toLowerCase()}`
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
            message: "Manufacturer approved successfully",
            manufacturerId: manufacturer._id,
            verificationStatus: manufacturer.verificationStatus
        });

    } catch (error) {
        console.error("Approve manufacturer error:", error);

        res.status(500).json({
            message: "Server error while approving manufacturer"
        });
    }
};


const rejectManufacturer = async (req, res) => {
    try {
        const { id } = req.params;

        const manufacturer = await Manufacturer.findById(id);

        if (!manufacturer) {
            return res.status(404).json({
                message: "Manufacturer not found"
            });
        }

        if (manufacturer.verificationStatus !== "PENDING") {
            return res.status(400).json({
                message: `Manufacturer is already ${manufacturer.verificationStatus.toLowerCase()}`
            });
        }

        manufacturer.verificationStatus = "REJECTED";

        await manufacturer.save();

        await User.findByIdAndUpdate(
            manufacturer.userId,
            {
                status: "REJECTED"
            }
        );

        res.status(200).json({
            message: "Manufacturer rejected successfully",
            manufacturerId: manufacturer._id,
            verificationStatus: manufacturer.verificationStatus
        });

    } catch (error) {
        console.error("Reject manufacturer error:", error);

        res.status(500).json({
            message: "Server error while rejecting manufacturer"
        });
    }
};
module.exports = {
    getPendingManufacturers,
    approveManufacturer,
    rejectManufacturer
};