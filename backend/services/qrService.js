const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");

const generateProductQR = async (product) => {
    const payload = {
        productCode: product.productCode,
        productName: product.productName,
        brandName: product.brandName,
        category: product.category,
        productHash: product.productHash
    };

    const qrDirectory = path.join(
        process.cwd(),
        "uploads",
        "qrcodes"
    );

    // Create folder if it doesn't exist
    if (!fs.existsSync(qrDirectory)) {
        fs.mkdirSync(qrDirectory, { recursive: true });
    }

    const fileName = `${product.productCode}.png`;

    const filePath = path.join(
        qrDirectory,
        fileName
    );

    await QRCode.toFile(
        filePath,
        JSON.stringify(payload),
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
