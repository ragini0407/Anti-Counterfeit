const ALLOWED_METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS"];
const ALLOWED_HEADERS = ["Content-Type", "Authorization", "Idempotency-Key"];
const EXPOSED_HEADERS = ["Idempotency-Key"];

const DEFAULT_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5000",
    "http://127.0.0.1:5000"
];

const isLoopbackHost = (hostname) => {
    const lower = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
    if (lower === "localhost" || lower.endsWith(".localhost")) return true;
    if (lower === "::1" || lower === "0.0.0.0") return true;
    if (/^127(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/.test(lower)) return true;
    return false;
};

/**
 * Parses and validates frontend origins from an environment string.
 * Supports single or comma/space-separated URLs.
 * In production:
 *   - Requires every origin to use HTTPS.
 *   - Rejects localhost, 127.0.0.1, and other loopback hostnames.
 *   - Throws if missing, invalid, or containing wildcard "*".
 * In development: defaults to standard local development origins.
 */
const parseAllowedOrigins = (
    rawOrigins = process.env.FRONTEND_ORIGIN,
    isProduction = process.env.NODE_ENV === "production"
) => {
    const hasRaw = typeof rawOrigins === "string" && rawOrigins.trim().length > 0;

    if (!hasRaw) {
        if (isProduction) {
            throw new Error(
                "FRONTEND_ORIGIN is required in production and must contain one or more valid HTTPS origins."
            );
        }
        return [...DEFAULT_DEV_ORIGINS];
    }

    const tokens = rawOrigins
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);

    if (tokens.length === 0) {
        if (isProduction) {
            throw new Error(
                "FRONTEND_ORIGIN is required in production and must contain one or more valid HTTPS origins."
            );
        }
        return [...DEFAULT_DEV_ORIGINS];
    }

    const parsedOrigins = [];

    for (const token of tokens) {
        if (token === "*") {
            throw new Error("Wildcard origin '*' is not permitted. Explicit origins must be specified.");
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(token);
        } catch {
            throw new Error(
                `Invalid FRONTEND_ORIGIN value: '${token}'. Each origin must be a valid URL with protocol and host.`
            );
        }

        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
            throw new Error(
                `Invalid FRONTEND_ORIGIN protocol in '${token}'. Only 'http:' and 'https:' are supported.`
            );
        }

        if (isProduction) {
            if (parsedUrl.protocol !== "https:") {
                throw new Error(
                    `Insecure protocol in '${token}'. In production, every FRONTEND_ORIGIN must use HTTPS.`
                );
            }

            if (isLoopbackHost(parsedUrl.hostname)) {
                throw new Error(
                    `Loopback origin '${token}' is not permitted in production. Configure a public HTTPS origin.`
                );
            }
        }

        const canonicalOrigin = parsedUrl.origin;
        if (!parsedOrigins.includes(canonicalOrigin)) {
            parsedOrigins.push(canonicalOrigin);
        }
    }

    if (!isProduction) {
        for (const devOrigin of DEFAULT_DEV_ORIGINS) {
            if (!parsedOrigins.includes(devOrigin)) {
                parsedOrigins.push(devOrigin);
            }
        }
    }

    return parsedOrigins;
};

/**
 * Evaluates reverse-proxy trust settings safely.
 * Never allows unbounded blind trust (`true`). Maps `true` and `1` to single-hop trust.
 * Defaults to 1 hop in production (standard PaaS/reverse-proxy setup) and false in development.
 */
const parseTrustProxySetting = (
    trustProxyVal = process.env.TRUST_PROXY,
    nodeEnv = process.env.NODE_ENV
) => {
    if (trustProxyVal === undefined || trustProxyVal === null || String(trustProxyVal).trim() === "") {
        return nodeEnv === "production" ? 1 : false;
    }

    const trimmed = String(trustProxyVal).trim();

    if (trimmed.toLowerCase() === "false" || trimmed === "0") {
        return false;
    }

    // Never blindly trust arbitrary proxies; map "true" to 1 hop
    if (trimmed.toLowerCase() === "true" || trimmed === "1") {
        return 1;
    }

    const num = Number(trimmed);
    if (Number.isInteger(num) && num > 0) {
        return num;
    }

    if (["loopback", "linklocal", "uniquelocal"].includes(trimmed.toLowerCase())) {
        return trimmed.toLowerCase();
    }

    if (trimmed.includes(",")) {
        return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    }

    return trimmed;
};

/**
 * Creates configuration options for the Express cors middleware.
 */
const createCorsOptions = ({
    frontendOrigin = process.env.FRONTEND_ORIGIN,
    nodeEnv = process.env.NODE_ENV
} = {}) => {
    const isProduction = nodeEnv === "production";
    const allowedOrigins = parseAllowedOrigins(frontendOrigin, isProduction);

    return {
        origin: (origin, callback) => {
            // Allow requests with no origin (e.g. server-to-server health checks, curl, mobile native apps)
            if (!origin) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(new Error(`Origin ${origin} is not allowed by CORS`));
        },
        methods: ALLOWED_METHODS,
        allowedHeaders: ALLOWED_HEADERS,
        exposedHeaders: EXPOSED_HEADERS,
        optionsSuccessStatus: 204
    };
};

/**
 * Middleware to intercept CORS rejection errors and return an explicit HTTP 403 Forbidden.
 */
const corsErrorHandler = (err, req, res, next) => {
    if (err && err.message && err.message.includes("is not allowed by CORS")) {
        return res.status(403).json({
            error: "Forbidden",
            message: "Origin is not allowed by CORS policy."
        });
    }
    next(err);
};

module.exports = {
    ALLOWED_METHODS,
    ALLOWED_HEADERS,
    EXPOSED_HEADERS,
    DEFAULT_DEV_ORIGINS,
    isLoopbackHost,
    parseAllowedOrigins,
    parseTrustProxySetting,
    createCorsOptions,
    corsErrorHandler
};
