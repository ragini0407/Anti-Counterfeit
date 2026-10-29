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
        productRegistrationService.getApprovedPartners("DISTRIBUTOR", { SupplyChainPartner }),
        (error) => error === failure && error.partnerDiagnosticStage === STAGES.MONGODB_PARTNER_QUERY
    );
    assert.deepEqual(getPartnerDiagnosticLogFields(failure), {
        stage: STAGES.MONGODB_PARTNER_QUERY,
        ethersErrorCode: null,
        httpStatus: null
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
        JSON.stringify({ stage: STAGES.RPC_GET_CODE, ethersErrorCode: "SERVER_ERROR", httpStatus: 503 })
    ]]);
    const loggedText = JSON.stringify(logs);
    assert.equal(loggedText.includes("DO_NOT_LOG"), false);
    assert.equal(loggedText.includes("rpc.example.invalid"), false);
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
