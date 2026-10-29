const PARTNER_DIAGNOSTIC_STAGES = Object.freeze({
    MONGODB_PARTNER_QUERY: "mongodb_partner_query",
    V2_CONFIGURATION: "v2_configuration",
    RPC_GET_NETWORK: "rpc_get_network",
    RPC_GET_CODE: "rpc_get_code",
    CONTRACT_GET_ROLE: "contract_get_role"
});

const ALLOWED_STAGES = new Set(Object.values(PARTNER_DIAGNOSTIC_STAGES));
const RPC_STAGES = new Set([
    PARTNER_DIAGNOSTIC_STAGES.RPC_GET_NETWORK,
    PARTNER_DIAGNOSTIC_STAGES.RPC_GET_CODE,
    PARTNER_DIAGNOSTIC_STAGES.CONTRACT_GET_ROLE
]);
// These are ethers v6 error codes that can arise from the read-only provider,
// contract-call, or address-validation operations used by partner lookup.
const ALLOWED_ETHERS_ERROR_CODES = new Set([
    "BAD_DATA",
    "CALL_EXCEPTION",
    "INVALID_ARGUMENT",
    "NETWORK_ERROR",
    "SERVER_ERROR",
    "TIMEOUT",
    "UNKNOWN_ERROR",
    "UNSUPPORTED_OPERATION"
]);

const withPartnerDiagnosticStage = async (stage, operation) => {
    try {
        return await operation();
    } catch (error) {
        const tagged = error && typeof error === "object"
            ? error
            : new Error("Partner lookup failed");
        if (!tagged.partnerDiagnosticStage) {
            tagged.partnerDiagnosticStage = ALLOWED_STAGES.has(stage) ? stage : "v2_configuration";
        }
        if (RPC_STAGES.has(tagged.partnerDiagnosticStage)) {
            const candidates = [
                tagged.info?.responseStatus,
                tagged.info?.response?.statusCode,
                tagged.info?.response?.status
            ];
            for (const candidate of candidates) {
                const status = typeof candidate === "number"
                    ? candidate
                    : Number(String(candidate || "").match(/^\s*(\d{3})\b/)?.[1]);
                if (Number.isInteger(status) && status >= 100 && status <= 599) {
                    tagged.partnerDiagnosticHttpStatus = status;
                    break;
                }
            }
        }
        throw tagged;
    }
};

const createPartnerDiagnosticError = (stage, message) => {
    const error = new Error(message);
    error.partnerDiagnosticStage = ALLOWED_STAGES.has(stage) ? stage : "v2_configuration";
    return error;
};

const getPartnerDiagnosticLogFields = (error) => {
    const stage = ALLOWED_STAGES.has(error?.partnerDiagnosticStage)
        ? error.partnerDiagnosticStage
        : "v2_configuration";
    const isRpcStage = RPC_STAGES.has(stage);
    const rawCode = isRpcStage && typeof error?.code === "string" ? error.code : "";
    const ethersErrorCode = ALLOWED_ETHERS_ERROR_CODES.has(rawCode) ? rawCode : null;
    const status = isRpcStage ? error?.partnerDiagnosticHttpStatus : null;
    const httpStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;

    return { stage, ethersErrorCode, httpStatus };
};

module.exports = {
    PARTNER_DIAGNOSTIC_STAGES,
    withPartnerDiagnosticStage,
    createPartnerDiagnosticError,
    getPartnerDiagnosticLogFields
};
