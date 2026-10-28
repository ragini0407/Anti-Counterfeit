const axios = require("axios");
const FormData = require("form-data");

const AI_SERVICE_URL =
    process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";

const getAiToken = () => process.env.AI_SERVICE_TOKEN || "";
const aiIsEnabled = () => process.env.AI_ENABLED === "true" && getAiToken().length >= 32;
const disabledError = () => Object.assign(
    new Error("AI analysis is disabled or secure AI credentials are not configured"),
    { code: "AI_DISABLED" }
);


const predictImage = async (file) => {

    if (!aiIsEnabled()) throw disabledError();

    if (!file) {
        throw new Error("No image file provided");
    }

    const form = new FormData();

    if (file.buffer) {

        form.append(
            "file",
            file.buffer,
            {
                filename:
                    file.originalname || "product.jpg",
                contentType:
                    file.mimetype || "image/jpeg"
            }
        );

    } else if (file.path) {

        const fs = require("fs");

        form.append(
            "file",
            fs.createReadStream(file.path)
        );

    } else {

        throw new Error(
            "Uploaded file has no buffer or path"
        );
    }

    try {

        const response = await axios.post(
            `${AI_SERVICE_URL}/predict`,
            form,
            {
                headers: { ...form.getHeaders(), Authorization: `Bearer ${getAiToken()}` },
                timeout: 15000
            }
        );

        return response.data;

    } catch (error) {

        if (error.response) {

            throw new Error(
                `AI prediction service returned ${error.response.status}`
            );

        }

        if (error.code === "ECONNABORTED") {

            throw new Error(
                "AI prediction service timed out"
            );

        }

        if (
            error.code === "ECONNREFUSED" ||
            error.code === "ENOTFOUND"
        ) {

            throw new Error(
                "AI prediction service is unavailable"
            );

        }

        throw new Error(
            `AI prediction failed: ${error.message}`
        );
    }
};


const scoreScanBehavior = async ({
    scan_count,
    distinct_locations,
    avg_time_between_scans_hr
}) => {

    if (!aiIsEnabled()) throw disabledError();

    try {

        const response = await axios.post(
            `${AI_SERVICE_URL}/score`,
            {
                scan_count,
                distinct_locations,
                avg_time_between_scans_hr
            },
            {
                timeout: 10000,
                headers: { Authorization: `Bearer ${getAiToken()}` }
            }
        );

        return response.data;

    } catch (error) {

        if (error.response) {

            throw new Error(
                `AI behaviour scoring service returned ${error.response.status}`
            );

        }

        if (error.code === "ECONNABORTED") {

            throw new Error(
                "AI behaviour scoring service timed out"
            );

        }

        if (
            error.code === "ECONNREFUSED" ||
            error.code === "ENOTFOUND"
        ) {

            throw new Error(
                "AI behaviour scoring service is unavailable"
            );

        }

        throw new Error(
            `AI behaviour scoring failed: ${error.message}`
        );
    }
};

// A health check reports availability without exposing the configured service URL.
const checkAiService = async () => {
    if (!aiIsEnabled()) {
        return { available: false, scanScoringModelLoaded: false };
    }
    try {
        const response = await axios.get(`${AI_SERVICE_URL}/health`, {
            timeout: 2500,
            headers: { Authorization: `Bearer ${getAiToken()}` }
        });
        const data = response.data;
        return {
            available: response.status === 200 && data?.status === "ok",
            scanScoringModelLoaded: data?.scan_scoring_model_loaded === true
        };
    } catch {
        return { available: false, scanScoringModelLoaded: false };
    }
};


module.exports = {
    predictImage,
    scoreScanBehavior,
    checkAiService,
    aiIsEnabled
};
