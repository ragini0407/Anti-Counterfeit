const axios = require("axios");
const FormData = require("form-data");

const AI_SERVICE_URL =
    process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";


const predictImage = async (file) => {

    if (!file) {
        throw new Error("No image file provided");
    }

    const form = new FormData();

    if (file.buffer) {
        form.append(
            "file",
            file.buffer,
            {
                filename: file.originalname || "product.jpg",
                contentType: file.mimetype || "image/jpeg"
            }
        );
    } else if (file.path) {
        const fs = require("fs");

        form.append(
            "file",
            fs.createReadStream(file.path)
        );
    } else {
        throw new Error("Uploaded file has no buffer or path");
    }

    const response = await axios.post(
        `${AI_SERVICE_URL}/predict`,
        form,
        {
            headers: form.getHeaders(),
            timeout: 15000
        }
    );

    return response.data;
};


const scoreScanBehavior = async ({
    scan_count,
    distinct_locations,
    avg_time_between_scans_hr
}) => {

    const response = await axios.post(
        `${AI_SERVICE_URL}/score`,
        {
            scan_count,
            distinct_locations,
            avg_time_between_scans_hr
        },
        {
            timeout: 10000
        }
    );

    return response.data;
};


module.exports = {
    predictImage,
    scoreScanBehavior
};