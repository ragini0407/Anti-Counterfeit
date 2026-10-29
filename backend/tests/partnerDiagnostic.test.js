const test = require("node:test");
const assert = require("node:assert/strict");
const {
    PARTNER_DIAGNOSTIC_STAGES: STAGES,
    withPartnerDiagnosticStage,
    createPartnerDiagnosticError,
    getPartnerDiagnosticLogFields
} = require("../services/partnerDiagnostic");
const productRegistrationService = require("../services/productRegistrationService");
const productController = require("../controllers/productController");

const sensitiveError = () => Object.assign(new Error("DO_NOT_LOG_RPC_URL_OR_RESPONSE"), {
    code: "SERVER_ERROR",
    info: {
        responseStatus: "503 Service Unavailable",
        responseBody: "DO_NOT_LOG_RESPONSE_BODY",
        request: { url: "https://rpc.example.invalid/credential" }
    }
});

test("V2 configuration failures use the allowlisted configuration stage", () => {
    const failure = createPartnerDiagnosticError(
        STAGES.V2_CONFIGURATION,
        "DO_NOT_LOG_CONFIGURATION_DETAILS"
    );
    assert.deepEqual(getPartnerDiagnosticLogFields(failure), {
        stage: STAGES.V2_CONFIGURATION,
        ethersErrorCode: null,
        httpStatus: null
    });
    assert.equal(JSON.stringify(getPartnerDiagnosticLogFields(failure)).includes("DO_NOT_LOG"), false);
});

for (const stage of [
    STAGES.RPC_GET_NETWORK,
    STAGES.RPC_GET_CODE,
    STAGES.CONTRACT_GET_ROLE
]) {
    test(`${stage} failure is tagged with only safe diagnostic fields`, async () => {
        const failure = sensitiveError();
        await assert.rejects(
            withPartnerDiagnosticStage(stage, async () => { throw failure; }),
            (error) => error === failure && error.partnerDiagnosticStage === stage
        );

        const fields = getPartnerDiagnosticLogFields(failure);
        assert.deepEqual(fields, { stage, ethersErrorCode: "SERVER_ERROR", httpStatus: 503 });
        const loggedFields = JSON.stringify(fields);
        assert.equal(loggedFields.includes("rpc.example.invalid"), false);
        assert.equal(loggedFields.includes("DO_NOT_LOG"), false);
        assert.equal(Object.keys(fields).sort().join(","), "ethersErrorCode,httpStatus,stage");
    });
}

test("MongoDB partner-query failures do not log database error codes or details", async () => {
    const failure = Object.assign(new Error("DO_NOT_LOG_DATABASE_DETAILS"), { code: "SERVER_ERROR" });
    const SupplyChainPartner = {
        find() { throw failure; }
    };

    await assert.rejects(
        productRegistrationService.getApprovedPartners("DISTRIBUTOR", {
            SupplyChainPartner,
            blockchainV2: { assertSepolia: async () => {}, ROLE: { DISTRIBUTOR: 2, RETAILER: 3 } }
        }),
        (error) => error === failure && error.partnerDiagnosticStage === STAGES.MONGODB_PARTNER_QUERY
    );
    assert.deepEqual(getPartnerDiagnosticLogFields(failure), {
        stage: STAGES.MONGODB_PARTNER_QUERY,
        ethersErrorCode: null,
        httpStatus: null
    });
    assert.deepEqual(failure.partnerLookupDiagnostics, {
        partnerType: "DISTRIBUTOR",
        rpcStatus: "SUCCESS",
        stageCounts: {
            mongoMatched: 0,
            activeUsers: 0,
            walletsPresent: 0,
            walletsVerified: 0,
            roleReads: 0,
            roleMatches: 0,
            returned: 0
        }
    });
});

test("partner controller keeps the generic 503 and logs only sanitized fields", async (t) => {
    const originalLookup = productRegistrationService.getApprovedPartners;
    const originalConsoleError = console.error;
    const failure = sensitiveError();
    failure.partnerDiagnosticStage = STAGES.RPC_GET_CODE;
    failure.partnerDiagnosticHttpStatus = 503;
    const logs = [];
    let responseStatus;
    let responseBody;

    productRegistrationService.getApprovedPartners = async () => { throw failure; };
    console.error = (...args) => logs.push(args);
    t.after(() => {
        productRegistrationService.getApprovedPartners = originalLookup;
        console.error = originalConsoleError;
    });

    const response = {
        status(code) { responseStatus = code; return this; },
        json(body) { responseBody = body; return this; }
    };
    await productController.getApprovedPartners({ query: { type: "DISTRIBUTOR" } }, response);

    assert.equal(responseStatus, 503);
    assert.deepEqual(responseBody, {
        message: "ProductRegistry V2 partner authorization is unavailable or not configured"
    });
    assert.deepEqual(logs, [[
        "Get authorized partners failed:",
        JSON.stringify({
            partnerType: "DISTRIBUTOR",
            rpcStatus: "NOT_CHECKED",
            stageCounts: {
                mongoMatched: 0,
                activeUsers: 0,
                walletsPresent: 0,
                walletsVerified: 0,
                roleReads: 0,
                roleMatches: 0,
                returned: 0
            },
            error: { stage: STAGES.RPC_GET_CODE, ethersErrorCode: "SERVER_ERROR", httpStatus: 503 }
        })
    ]]);
    const loggedText = JSON.stringify(logs);
    assert.equal(loggedText.includes("DO_NOT_LOG"), false);
    assert.equal(loggedText.includes("rpc.example.invalid"), false);
});

test("partner controller logs only aggregate success diagnostics and preserves response shape", async (t) => {
    const originalLookup = productRegistrationService.getApprovedPartners;
    const originalConsoleInfo = console.info;
    const logs = [];
    let responseStatus;
    let responseBody;
    const counts = {
        mongoMatched: 2,
        activeUsers: 2,
        walletsPresent: 2,
        walletsVerified: 2,
        roleReads: 2,
        roleMatches: 1,
        returned: 1
    };
    const partners = [{
        id: "private-id",
        companyName: "PRIVATE_COMPANY_NAME",
        walletAddress: "0x0000000000000000000000000000000000000001"
    }];

    productRegistrationService.getApprovedPartners = async (type, _overrides, onDiagnostic) => {
        onDiagnostic({ partnerType: type, rpcStatus: "SUCCESS", stageCounts: counts });
        return partners;
    };
    console.info = (...args) => logs.push(args);
    t.after(() => {
        productRegistrationService.getApprovedPartners = originalLookup;
        console.info = originalConsoleInfo;
    });

    const response = {
        status(code) { responseStatus = code; return this; },
        json(body) { responseBody = body; return this; }
    };
    await productController.getApprovedPartners({ query: { type: "DISTRIBUTOR" } }, response);

    assert.equal(responseStatus, 200);
    assert.deepEqual(responseBody, { partners });
    assert.deepEqual(logs, [[
        "Partner lookup diagnostics:",
        JSON.stringify({ partnerType: "DISTRIBUTOR", rpcStatus: "SUCCESS", stageCounts: counts })
    ]]);
    const loggedText = JSON.stringify(logs);
    assert.equal(loggedText.includes("PRIVATE_COMPANY_NAME"), false);
    assert.equal(loggedText.includes("0x0000000000000000000000000000000000000001"), false);
    assert.equal(loggedText.includes("private-id"), false);
});

test("partner lookup reports aggregate eligibility counts after V2 preflight", async () => {
    const now = new Date();
    const wallet = (suffix) => `0x${String(suffix).padStart(40, "0")}`;
    const candidates = [
        { _id: "synthetic-1", companyName: "synthetic", userId: { status: "ACTIVE", walletAddress: wallet(1), walletVerifiedAt: now }, role: 2 },
        { _id: "synthetic-2", companyName: "synthetic", userId: { status: "SUSPENDED", walletAddress: wallet(2), walletVerifiedAt: now }, role: 2 },
        { _id: "synthetic-3", companyName: "synthetic", userId: { status: "ACTIVE", walletAddress: null, walletVerifiedAt: now }, role: 2 },
        { _id: "synthetic-4", companyName: "synthetic", userId: { status: "ACTIVE", walletAddress: wallet(4), walletVerifiedAt: null }, role: 2 },
        { _id: "synthetic-5", companyName: "synthetic", userId: { status: "ACTIVE", walletAddress: wallet(5), walletVerifiedAt: now }, role: 3 }
    ];
    let preflightCalls = 0;
    let roleReadCalls = 0;
    let query;
    let diagnostic;
    const SupplyChainPartner = {
        find(filter) {
            query = filter;
            return {
                populate(path, projection) {
                    assert.equal(path, "userId");
                    assert.equal(projection, "name status walletAddress walletVerifiedAt");
                    return { sort: async () => candidates };
                }
            };
        }
    };
    const blockchainV2 = {
        ROLE: { DISTRIBUTOR: 2, RETAILER: 3 },
        assertSepolia: async () => { preflightCalls++; },
        getRole: async (address) => {
            roleReadCalls++;
            return address.toLowerCase() === wallet(1).toLowerCase() ? 2 : 3;
        }
    };

    const partners = await productRegistrationService.getApprovedPartners(
        "DISTRIBUTOR",
        { SupplyChainPartner, blockchainV2 },
        (record) => { diagnostic = record; }
    );

    assert.deepEqual(query, { partnerType: "DISTRIBUTOR", verificationStatus: "VERIFIED" });
    assert.equal(preflightCalls, 1);
    assert.equal(roleReadCalls, 2);
    assert.equal(partners.length, 1);
    assert.deepEqual(diagnostic, {
        partnerType: "DISTRIBUTOR",
        rpcStatus: "SUCCESS",
        stageCounts: {
            mongoMatched: 5,
            activeUsers: 4,
            walletsPresent: 3,
            walletsVerified: 2,
            roleReads: 2,
            roleMatches: 1,
            returned: 1
        }
    });
});

test("V2 preflight failure stops lookup and records a sanitized failure", async () => {
    const failure = sensitiveError();
    failure.partnerDiagnosticStage = STAGES.RPC_GET_NETWORK;
    failure.partnerDiagnosticHttpStatus = 522;
    failure.info.responseStatus = "522 Connection timed out";
    let queryCalled = false;
    let diagnostic;
    const blockchainV2 = {
        ROLE: { DISTRIBUTOR: 2, RETAILER: 3 },
        assertSepolia: async () => { throw failure; }
    };

    await assert.rejects(
        productRegistrationService.getApprovedPartners(
            "RETAILER",
            {
                blockchainV2,
                SupplyChainPartner: { find() { queryCalled = true; throw new Error("unexpected query"); } }
            },
            (record) => { diagnostic = record; }
        ),
        (error) => error === failure && error.partnerLookupDiagnostics.rpcStatus === "FAILURE"
    );

    assert.equal(queryCalled, false);
    assert.deepEqual(diagnostic, {
        partnerType: "RETAILER",
        rpcStatus: "FAILURE",
        stageCounts: {
            mongoMatched: 0,
            activeUsers: 0,
            walletsPresent: 0,
            walletsVerified: 0,
            roleReads: 0,
            roleMatches: 0,
            returned: 0
        },
        error: { stage: STAGES.RPC_GET_NETWORK, ethersErrorCode: "SERVER_ERROR", httpStatus: 522 }
    });
    const safeRecord = JSON.stringify(diagnostic);
    assert.equal(safeRecord.includes("rpc.example.invalid"), false);
    assert.equal(safeRecord.includes("DO_NOT_LOG"), false);
});

test("failed role read rejects instead of returning an empty successful partner list", async () => {
    const failure = sensitiveError();
    failure.partnerDiagnosticStage = STAGES.CONTRACT_GET_ROLE;
    failure.partnerDiagnosticHttpStatus = 503;
    const candidate = {
        _id: "synthetic-private-id",
        companyName: "synthetic-private-name",
        userId: { status: "ACTIVE", walletAddress: "0x0000000000000000000000000000000000000001", walletVerifiedAt: new Date() }
    };
    let diagnostic;

    await assert.rejects(
        productRegistrationService.getApprovedPartners(
            "DISTRIBUTOR",
            {
                blockchainV2: {
                    ROLE: { DISTRIBUTOR: 2, RETAILER: 3 },
                    assertSepolia: async () => {},
                    getRole: async () => { throw failure; }
                },
                SupplyChainPartner: { find: () => ({ populate: () => ({ sort: async () => [candidate] }) }) }
            },
            (record) => { diagnostic = record; }
        ),
        (error) => error === failure && error.partnerLookupDiagnostics.rpcStatus === "FAILURE"
    );

    assert.deepEqual(diagnostic.stageCounts, {
        mongoMatched: 1,
        activeUsers: 1,
        walletsPresent: 1,
        walletsVerified: 1,
        roleReads: 1,
        roleMatches: 0,
        returned: 0
    });
    const safeRecord = JSON.stringify(diagnostic);
    assert.equal(safeRecord.includes("synthetic-private"), false);
    assert.equal(safeRecord.includes("0x0000000000000000000000000000000000000001"), false);
    assert.equal(safeRecord.includes("DO_NOT_LOG"), false);
});

test("unknown or malformed diagnostics are reduced to safe fallback fields", () => {
    assert.deepEqual(getPartnerDiagnosticLogFields({
        partnerDiagnosticStage: "https://secret.invalid",
        code: "SERVER_ERROR\nINJECTED",
        partnerDiagnosticHttpStatus: "503 Service Unavailable"
    }), {
        stage: "v2_configuration",
        ethersErrorCode: null,
        httpStatus: null
    });
});

test("known ethers v6 RPC error codes are preserved", () => {
    assert.deepEqual(getPartnerDiagnosticLogFields({
        partnerDiagnosticStage: STAGES.RPC_GET_NETWORK,
        code: "NETWORK_ERROR",
        partnerDiagnosticHttpStatus: 502
    }), {
        stage: STAGES.RPC_GET_NETWORK,
        ethersErrorCode: "NETWORK_ERROR",
        httpStatus: 502
    });
    assert.deepEqual(getPartnerDiagnosticLogFields({
        partnerDiagnosticStage: STAGES.CONTRACT_GET_ROLE,
        code: "SERVER_ERROR"
    }).ethersErrorCode, "SERVER_ERROR");
});

test("arbitrary uppercase error codes are omitted from diagnostics", () => {
    const fields = getPartnerDiagnosticLogFields({
        partnerDiagnosticStage: STAGES.RPC_GET_CODE,
        code: "PRIVATE_KEY_SHOULD_NOT_LOG",
        partnerDiagnosticHttpStatus: 503
    });
    assert.deepEqual(fields, {
        stage: STAGES.RPC_GET_CODE,
        ethersErrorCode: null,
        httpStatus: 503
    });
    assert.equal(JSON.stringify(fields).includes("PRIVATE_KEY"), false);
});
