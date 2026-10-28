const lifecycleService = require("../services/productLifecycleService");

const parsePage = (value, fallback, max = 100) => {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
        const error = new Error("Pagination values are invalid");
        error.statusCode = 400;
        throw error;
    }
    return parsed;
};

const sendError = (res, error, fallback) => res.status(error.statusCode || 503).json({
    success: false,
    code: /^[A-Z0-9_]+$/.test(String(error.code || "")) ? error.code : "LIFECYCLE_REQUEST_FAILED",
    message: error.statusCode ? error.message : fallback
});

const getAssignedProducts = async (req, res) => {
    try {
        const page = parsePage(req.query.page, 1);
        const pageSize = parsePage(req.query.pageSize, 20, 100);
        const result = await lifecycleService.listAssignedProducts({
            userId: req.user.userId,
            role: req.user.role,
            page,
            pageSize
        });
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        return sendError(res, error, "Product assignments are temporarily unavailable");
    }
};

const prepareLifecycleAction = async (req, res) => {
    try {
        const operation = await lifecycleService.prepareLifecycleAction({
            userId: req.user.userId,
            role: req.user.role,
            productCode: req.params.productCode,
            action: req.body.action
        });
        return res.status(200).json({ success: true, operation });
    } catch (error) {
        return sendError(res, error, "Could not prepare the lifecycle transaction");
    }
};

const claimLifecycleSubmission = async (req, res) => {
    try {
        const operation = await lifecycleService.claimLifecycleSubmission({
            userId: req.user.userId,
            role: req.user.role,
            operationId: req.params.operationId,
            submissionAttemptId: req.body.submissionAttemptId
        });
        return res.status(200).json({ success: true, operation });
    } catch (error) {
        return sendError(res, error, "Could not reserve this lifecycle operation for wallet submission");
    }
};

const releaseLifecycleSubmission = async (req, res) => {
    try {
        const operation = await lifecycleService.releaseLifecycleSubmission({
            userId: req.user.userId,
            role: req.user.role,
            operationId: req.params.operationId,
            submissionAttemptId: req.body.submissionAttemptId
        });
        return res.status(200).json({ success: true, operation });
    } catch (error) {
        return sendError(res, error, "Could not release the rejected wallet request");
    }
};

const confirmLifecycleAction = async (req, res) => {
    try {
        const operation = await lifecycleService.confirmLifecycleAction({
            userId: req.user.userId,
            role: req.user.role,
            operationId: req.params.operationId,
            transactionHash: req.body.transactionHash,
            submissionAttemptId: req.body.submissionAttemptId
        });
        return res.status(200).json({ success: true, operation });
    } catch (error) {
        return sendError(res, error, "Transaction confirmation is unavailable; retry with the same transaction hash");
    }
};

const getAdminProductLifecycle = async (req, res) => {
    try {
        const page = parsePage(req.query.page, 1);
        const pageSize = parsePage(req.query.pageSize, 20, 100);
        const result = await lifecycleService.getAdminProductLifecycle({
            productCode: req.params.productCode,
            page,
            pageSize
        });
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        return sendError(res, error, "Product lifecycle data is temporarily unavailable");
    }
};

module.exports = {
    getAssignedProducts,
    prepareLifecycleAction,
    claimLifecycleSubmission,
    releaseLifecycleSubmission,
    confirmLifecycleAction,
    getAdminProductLifecycle
};
