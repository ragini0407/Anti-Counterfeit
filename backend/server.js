const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const productRoutes = require("./routes/productRoutes");
const { checkAiService } = require("./services/aiService");
const {
    createCorsOptions,
    parseTrustProxySetting,
    corsErrorHandler
} = require("./config/cors");

const app = express();

const trustProxySetting = parseTrustProxySetting();
if (trustProxySetting !== false) {
    app.set("trust proxy", trustProxySetting);
}

app.use(cors(createCorsOptions()));
app.use(express.json());
app.use("/uploads", express.static("uploads"));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/products", productRoutes);

connectDB();

app.get("/", (req, res) => {
    res.json({
        message: "Fake Product Detection API is running"
    });
});

app.get("/api/health/ai", async (req, res) => {
    const health = await checkAiService();
    const ready = health.available && health.scanScoringModelLoaded;
    return res.status(ready ? 200 : 503).json({
        status: ready ? "available" : "unavailable",
        scanScoringModelLoaded: health.scanScoringModelLoaded
    });
});

app.use(corsErrorHandler);

const PORT = process.env.PORT || 5000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
