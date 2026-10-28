const test = require("node:test");
const assert = require("node:assert/strict");
const productRoutes = require("../routes/productRoutes");
const adminRoutes = require("../routes/adminRoutes");
const { protect } = require("../middleware/authMiddleware");

const route = (router, path, method) => router.stack.find((layer) =>
    layer.route?.path === path && layer.route.methods[method]
)?.route;

const checkRoleGate = (handler, role, expectedStatus, shouldNext) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json() { return this; } };
    let called = false;
    handler({ user: { role } }, res, () => { called = true; });
    assert.equal(res.statusCode, expectedStatus);
    assert.equal(called, shouldNext);
};

test("product lifecycle routes require authentication and supply-chain roles", () => {
    const expected = [
        ["/lifecycle", "get"],
        ["/:productCode/lifecycle/prepare", "post"],
        ["/lifecycle/operations/:operationId/claim", "post"],
        ["/lifecycle/operations/:operationId/release", "post"],
        ["/lifecycle/operations/:operationId/confirm", "post"]
    ];
    for (const [path, method] of expected) {
        const selected = route(productRoutes, path, method);
        assert.ok(selected);
        assert.equal(selected.stack[0].handle, protect);
        checkRoleGate(selected.stack[1].handle, "ADMIN", 403, false);
        for (const role of ["MANUFACTURER", "DISTRIBUTOR", "RETAILER"]) {
            checkRoleGate(selected.stack[1].handle, role, 200, true);
        }
    }
});

test("admin lifecycle detail endpoint is authenticated and ADMIN-only", () => {
    const selected = route(adminRoutes, "/products/:productCode/lifecycle", "get");
    assert.ok(selected);
    assert.equal(selected.stack[0].handle, protect);
    checkRoleGate(selected.stack[1].handle, "MANUFACTURER", 403, false);
    checkRoleGate(selected.stack[1].handle, "DISTRIBUTOR", 403, false);
    checkRoleGate(selected.stack[1].handle, "RETAILER", 403, false);
    checkRoleGate(selected.stack[1].handle, "ADMIN", 200, true);
});
