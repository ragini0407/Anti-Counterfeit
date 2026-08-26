const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");

const generateProductQR = async (productCode) => {
    const qrDirectory = path.join(
        process.cwd(),
        "uploads",
        "qrcodes"
    );

    // Create folder if it doesn't exist
    if (!fs.existsSync(qrDirectory)) {
        fs.mkdirSync(qrDirectory, { recursive: true });
    }

    const fileName = `${productCode}.png`;

    const filePath = path.join(
        qrDirectory,
        fileName
    );

    // For now, QR points to our backend verification endpoint
    const verificationUrl =
        `http://localhost:5000/api/products/verify/${productCode}`;

    await QRCode.toFile(
        filePath,
        verificationUrl,
        {
            width: 500,
            margin: 2
        }
    );

    return `/uploads/qrcodes/${fileName}`;
};

module.exports = {
    generateProductQR
};