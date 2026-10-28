const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const cors = require("cors");

const {
    ALLOWED_METHODS,
    ALLOWED_HEADERS,
    DEFAULT_DEV_ORIGINS,
    isLoopbackHost,
    parseAllowedOrigins,
    parseTrustProxySetting,
    createCorsOptions,
    corsErrorHandler
} = require("../config/cors");

// Helper to spin up an ephemeral test server with the given cors options
const createTestServer = async (corsOptions) => {
    const app = express();
    app.use(cors(corsOptions));
    app.use(express.json());

    app.get("/api/test", (req, res) => {
        res.status(200).json({ ok: true, message: "test-response" });
    });

    app.post("/api/test-mutation", (req, res) => {
        res.status(200).json({ ok: true, mutation: "applied" });
    });

    app.use(corsErrorHandler);

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const close = () => new Promise((resolve) => server.close(resolve));
    return { baseUrl, close };
};

// ============================================================
// ORIGIN PARSING AND VALIDATION TESTS
// ============================================================

test("isLoopbackHost identifies loopback hostnames and addresses", () => {
    assert.equal(isLoopbackHost("localhost"), true);
    assert.equal(isLoopbackHost("sub.localhost"), true);
    assert.equal(isLoopbackHost("127.0.0.1"), true);
    assert.equal(isLoopbackHost("127.0.1.10"), true);
    assert.equal(isLoopbackHost("::1"), true);
    assert.equal(isLoopbackHost("[::1]"), true);
    assert.equal(isLoopbackHost("0.0.0.0"), true);

    assert.equal(isLoopbackHost("example.com"), false);
    assert.equal(isLoopbackHost("anti-counterfeit.org"), false);
    assert.equal(isLoopbackHost("192.168.1.1"), false);
});

test("parseAllowedOrigins in development defaults to local dev origins when unset", () => {
    const origins = parseAllowedOrigins(undefined, false);
    assert.deepEqual(origins, DEFAULT_DEV_ORIGINS);
    assert.ok(origins.includes("http://localhost:5173"));
    assert.ok(origins.includes("http://127.0.0.1:5173"));
});

test("parseAllowedOrigins in development merges configured FRONTEND_ORIGIN with local dev origins", () => {
    const origins = parseAllowedOrigins("https://demo-mobile.example.com", false);
    assert.ok(origins.includes("https://demo-mobile.example.com"));
    assert.ok(origins.includes("http://localhost:5173"));
});

test("parseAllowedOrigins in development accepts explicit HTTP, localhost, and loopback origins", () => {
    for (const devTarget of [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://custom-dev.test:3000"
    ]) {
        const origins = parseAllowedOrigins(devTarget, false);
        const expected = new URL(devTarget).origin;
        assert.ok(origins.includes(expected));
    }
});

test("parseAllowedOrigins normalizes URLs with trailing slashes or subpaths to canonical origins", () => {
    const origins = parseAllowedOrigins("https://demo.example.com/app/path/", true);
    assert.deepEqual(origins, ["https://demo.example.com"]);
});

test("parseAllowedOrigins in production allows configured public HTTPS origin and excludes localhost defaults", () => {
    const origins = parseAllowedOrigins("https://anti-counterfeit.example.com", true);
    assert.deepEqual(origins, ["https://anti-counterfeit.example.com"]);
    assert.ok(!origins.includes("http://localhost:5173"));
    assert.ok(!origins.includes("http://127.0.0.1:5173"));
});

test("parseAllowedOrigins in production supports multiple comma- and space-separated HTTPS origins", () => {
    const origins = parseAllowedOrigins(
        "https://demo1.example.com, https://demo2.example.com https://demo3.example.com",
        true
    );
    assert.deepEqual(origins, [
        "https://demo1.example.com",
        "https://demo2.example.com",
        "https://demo3.example.com"
    ]);
});

test("parseAllowedOrigins in production throws safely when FRONTEND_ORIGIN is missing or empty", () => {
    for (const emptyVal of [undefined, null, "", "   "]) {
        assert.throws(
            () => parseAllowedOrigins(emptyVal, true),
            /FRONTEND_ORIGIN is required in production/
        );
    }
});

test("parseAllowedOrigins rejects wildcard '*' origin in all environments", () => {
    assert.throws(
        () => parseAllowedOrigins("*", true),
        /Wildcard origin '\*' is not permitted/
    );
    assert.throws(
        () => parseAllowedOrigins("*", false),
        /Wildcard origin '\*' is not permitted/
    );
});

test("parseAllowedOrigins in production strictly rejects insecure HTTP origins", () => {
    for (const insecureOrigin of [
        "http://insecure-domain.example.com",
        "http://demo.example.com:8080"
    ]) {
        assert.throws(
            () => parseAllowedOrigins(insecureOrigin, true),
            /In production, every FRONTEND_ORIGIN must use HTTPS/
        );
    }
});

test("parseAllowedOrigins in production strictly rejects localhost, 127.0.0.1, and loopback origins", () => {
    for (const loopbackOrigin of [
        "http://localhost:5173",
        "https://localhost:5173",
        "https://localhost",
        "http://127.0.0.1:5173",
        "https://127.0.0.1:5173",
        "https://127.0.0.1",
        "https://127.0.1.5:8000",
        "https://[::1]:5173",
        "https://0.0.0.0:5173"
    ]) {
        assert.throws(
            () => parseAllowedOrigins(loopbackOrigin, true),
            /(must use HTTPS|Loopback origin)/
        );
    }
});

test("parseAllowedOrigins rejects non-http/https protocols", () => {
    assert.throws(
        () => parseAllowedOrigins("ftp://files.example.com", false),
        /Only 'http:' and 'https:' are supported/
    );
    assert.throws(
        () => parseAllowedOrigins("javascript:alert(1)", false),
        /Only 'http:' and 'https:' are supported/
    );
});

test("parseAllowedOrigins rejects malformed URL values", () => {
    assert.throws(
        () => parseAllowedOrigins("not-a-valid-url", false),
        /Invalid FRONTEND_ORIGIN value/
    );
});

// ============================================================
// TRUST PROXY SETTING TESTS
// ============================================================

test("parseTrustProxySetting defaults unset to 1 in production and false in development", () => {
    assert.equal(parseTrustProxySetting(undefined, "production"), 1);
    assert.equal(parseTrustProxySetting(undefined, "development"), false);
    assert.equal(parseTrustProxySetting("", "production"), 1);
    assert.equal(parseTrustProxySetting("", "development"), false);
});

test("parseTrustProxySetting avoids blind trust by mapping 'true' and '1' to single hop", () => {
    assert.equal(parseTrustProxySetting("true", "production"), 1);
    assert.equal(parseTrustProxySetting("TRUE", "development"), 1);
    assert.equal(parseTrustProxySetting("1", "production"), 1);
});

test("parseTrustProxySetting maps 'false' and '0' to boolean false", () => {
    assert.equal(parseTrustProxySetting("false", "production"), false);
    assert.equal(parseTrustProxySetting("FALSE", "development"), false);
    assert.equal(parseTrustProxySetting("0", "production"), false);
});

test("parseTrustProxySetting parses numeric hop counts and keywords safely", () => {
    assert.equal(parseTrustProxySetting("2", "production"), 2);
    assert.equal(parseTrustProxySetting("loopback", "production"), "loopback");
    assert.equal(parseTrustProxySetting("linklocal", "production"), "linklocal");
});

test("parseTrustProxySetting parses comma-separated trusted IP lists", () => {
    assert.deepEqual(
        parseTrustProxySetting("10.0.0.1, 192.168.1.1", "production"),
        ["10.0.0.1", "192.168.1.1"]
    );
});

// ============================================================
// HTTP PREFLIGHT AND ORIGIN ENFORCEMENT TESTS
// ============================================================

test("preflight OPTIONS request for an allowed origin returns 204 with required headers and methods", async () => {
    const corsOptions = createCorsOptions({
        frontendOrigin: "https://demo.example.com",
        nodeEnv: "production"
    });
    const { baseUrl, close } = await createTestServer(corsOptions);

    try {
        const response = await fetch(`${baseUrl}/api/test`, {
            method: "OPTIONS",
            headers: {
                Origin: "https://demo.example.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type, Authorization, Idempotency-Key"
            }
        });

        assert.equal(response.status, 204);
        assert.equal(
            response.headers.get("access-control-allow-origin"),
            "https://demo.example.com"
        );
        const allowMethods = response.headers.get("access-control-allow-methods");
        for (const method of ALLOWED_METHODS) {
            assert.ok(
                allowMethods.includes(method),
                `Expected ${allowMethods} to contain ${method}`
            );
        }
        const allowHeaders = response.headers.get("access-control-allow-headers");
        for (const header of ALLOWED_HEADERS) {
            assert.ok(
                allowHeaders.toLowerCase().includes(header.toLowerCase()),
                `Expected ${allowHeaders} to contain ${header}`
            );
        }
    } finally {
        await close();
    }
});

test("preflight OPTIONS request for a disallowed origin returns 403 Forbidden", async () => {
    const corsOptions = createCorsOptions({
        frontendOrigin: "https://demo.example.com",
        nodeEnv: "production"
    });
    const { baseUrl, close } = await createTestServer(corsOptions);

    try {
        const response = await fetch(`${baseUrl}/api/test`, {
            method: "OPTIONS",
            headers: {
                Origin: "https://unauthorized-attacker.example.com",
                "Access-Control-Request-Method": "POST"
            }
        });

        assert.equal(response.status, 403);
        assert.equal(response.headers.get("access-control-allow-origin"), null);
        const body = await response.json();
        assert.equal(body.error, "Forbidden");
        assert.match(body.message, /Origin is not allowed by CORS/);
    } finally {
        await close();
    }
});

test("GET request from an allowed origin succeeds with Access-Control-Allow-Origin header", async () => {
    const corsOptions = createCorsOptions({
        frontendOrigin: "https://demo.example.com",
        nodeEnv: "production"
    });
    const { baseUrl, close } = await createTestServer(corsOptions);

    try {
        const response = await fetch(`${baseUrl}/api/test`, {
            method: "GET",
            headers: {
                Origin: "https://demo.example.com"
            }
        });

        assert.equal(response.status, 200);
        assert.equal(
            response.headers.get("access-control-allow-origin"),
            "https://demo.example.com"
        );
        const body = await response.json();
        assert.equal(body.ok, true);
    } finally {
        await close();
    }
});

test("POST request from a disallowed origin is blocked with 403 and does not execute downstream handler", async () => {
    const corsOptions = createCorsOptions({
        frontendOrigin: "https://demo.example.com",
        nodeEnv: "production"
    });
    const { baseUrl, close } = await createTestServer(corsOptions);

    try {
        const response = await fetch(`${baseUrl}/api/test-mutation`, {
            method: "POST",
            headers: {
                Origin: "https://unauthorized-site.com",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ action: "hack" })
        });

        assert.equal(response.status, 403);
        assert.equal(response.headers.get("access-control-allow-origin"), null);
        const body = await response.json();
        assert.equal(body.error, "Forbidden");
        assert.equal(body.mutation, undefined);
    } finally {
        await close();
    }
});

test("request without an Origin header (curl / health check / server-to-server) is permitted", async () => {
    const corsOptions = createCorsOptions({
        frontendOrigin: "https://demo.example.com",
        nodeEnv: "production"
    });
    const { baseUrl, close } = await createTestServer(corsOptions);

    try {
        const response = await fetch(`${baseUrl}/api/test`, {
            method: "GET"
        });

        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.ok, true);
    } finally {
        await close();
    }
});

test("preflight header filtering does not allow arbitrary unapproved request headers", async () => {
    const corsOptions = createCorsOptions({
        frontendOrigin: "https://demo.example.com",
        nodeEnv: "production"
    });
    const { baseUrl, close } = await createTestServer(corsOptions);

    try {
        const response = await fetch(`${baseUrl}/api/test`, {
            method: "OPTIONS",
            headers: {
                Origin: "https://demo.example.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "X-Malicious-Custom-Header"
            }
        });

        // Express cors package omits unapproved headers from Access-Control-Allow-Headers
        const allowHeaders = response.headers.get("access-control-allow-headers") || "";
        assert.ok(!allowHeaders.includes("X-Malicious-Custom-Header"));
    } finally {
        await close();
    }
});
