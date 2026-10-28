const test = require("node:test");
const assert = require("node:assert/strict");

const User = require("../models/User");
const SupplyChainPartner = require("../models/SupplyChainPartner");
const adminRoutes = require("../routes/adminRoutes");
const { protect } = require("../middleware/authMiddleware");
const {
    getPendingPartners,
    approvePartner,
    rejectPartner
} = require("../controllers/adminController");

function responseRecorder() {
    const result = { statusCode: 200, body: null };
    return {
        result,
        status(code) {
            result.statusCode = code;
            return this;
        },
        json(body) {
            result.body = body;
            return this;
        }
    };
}

function getRoute(method, routePath) {
    const layer = adminRoutes.stack.find(
        (item) => item.route?.path === routePath && item.route.methods[method]
    );
    assert.ok(layer, `Expected ${method.toUpperCase()} ${routePath} to be registered`);
    return layer.route;
}

test("pending-partner list and decisions keep authentication and admin-role middleware", () => {
    const routes = [
        getRoute("get", "/partners/pending"),
        getRoute("put", "/partners/:id/approve"),
        getRoute("put", "/partners/:id/reject")
    ];

    for (const route of routes) {
        assert.equal(route.stack[0].handle, protect, "route must authenticate first");
        assert.equal(route.stack.length, 3, "route must include auth, role guard, and controller");
        assert.equal(route.stack[2].name, route.path.endsWith("pending") ? "getPendingPartners" : route.path.endsWith("approve") ? "approvePartner" : "rejectPartner");

        const roleGuard = route.stack[1].handle;
        const denied = responseRecorder();
        let deniedNextCalled = false;
        roleGuard(
            { user: { role: "MANUFACTURER" } },
            denied,
            () => { deniedNextCalled = true; }
        );
        assert.equal(denied.result.statusCode, 403);
        assert.equal(deniedNextCalled, false);

        let adminNextCalled = false;
        roleGuard(
            { user: { role: "ADMIN" } },
            responseRecorder(),
            () => { adminNextCalled = true; }
        );
        assert.equal(adminNextCalled, true);
    }
});

test("pending-partner list returns only the existing pending-partners query result", async () => {
    const pending = [{ _id: "partner-1", partnerType: "DISTRIBUTOR" }];
    const originalFind = SupplyChainPartner.find;
    let receivedFilter;
    SupplyChainPartner.find = (filter) => {
        receivedFilter = filter;
        return {
            populate(field, projection) {
                assert.equal(field, "userId");
                assert.equal(projection, "name email status");
                return this;
            },
            sort(sortOrder) {
                assert.deepEqual(sortOrder, { createdAt: -1 });
                return Promise.resolve(pending);
            }
        };
    };

    try {
        const res = responseRecorder();
        await getPendingPartners({}, res);
        assert.deepEqual(receivedFilter, { verificationStatus: "PENDING" });
        assert.equal(res.result.statusCode, 200);
        assert.equal(res.result.body.count, 1);
        assert.deepEqual(res.result.body.partners, pending);
    } finally {
        SupplyChainPartner.find = originalFind;
    }
});

test("partner routes reject requests without a valid authenticated session", () => {
    for (const route of [
        getRoute("get", "/partners/pending"),
        getRoute("put", "/partners/:id/approve"),
        getRoute("put", "/partners/:id/reject")
    ]) {
        const res = responseRecorder();
        let nextCalled = false;
        route.stack[0].handle({ headers: {} }, res, () => { nextCalled = true; });
        assert.equal(res.result.statusCode, 401);
        assert.equal(nextCalled, false);
    }
});

async function withPartnerStubs(partner, run) {
    const originalFindById = SupplyChainPartner.findById;
    const originalUserUpdate = User.findByIdAndUpdate;
    const calls = { userUpdate: null };
    SupplyChainPartner.findById = async () => partner;
    User.findByIdAndUpdate = async (...args) => {
        calls.userUpdate = args;
        return { _id: args[0], ...args[1] };
    };

    try {
        await run(calls);
    } finally {
        SupplyChainPartner.findById = originalFindById;
        User.findByIdAndUpdate = originalUserUpdate;
    }
}

for (const partnerType of ["DISTRIBUTOR", "RETAILER"]) {
    test(`${partnerType.toLowerCase()} approval activates the user and verifies the partner profile`, async () => {
        const partner = {
            _id: "partner-1",
            userId: "user-1",
            partnerType,
            verificationStatus: "PENDING",
            save: async function save() { this.saved = true; }
        };

        await withPartnerStubs(partner, async (calls) => {
            const res = responseRecorder();
            await approvePartner({ params: { id: partner._id }, user: { userId: "admin-1" } }, res);

            assert.equal(res.result.statusCode, 200);
            assert.equal(res.result.body.partnerId, partner._id);
            assert.equal(res.result.body.partnerType, partnerType);
            assert.equal(res.result.body.verificationStatus, "VERIFIED");
            assert.equal(partner.verifiedBy, "admin-1");
            assert.ok(partner.verifiedAt instanceof Date);
            assert.equal(partner.saved, true);
            assert.deepEqual(calls.userUpdate, [partner.userId, { status: "ACTIVE" }]);
        });
    });

    test(`${partnerType.toLowerCase()} rejection rejects the user and partner profile`, async () => {
        const partner = {
            _id: "partner-2",
            userId: "user-2",
            partnerType,
            verificationStatus: "PENDING",
            save: async function save() { this.saved = true; }
        };

        await withPartnerStubs(partner, async (calls) => {
            const res = responseRecorder();
            await rejectPartner({ params: { id: partner._id }, user: { userId: "admin-1" } }, res);

            assert.equal(res.result.statusCode, 200);
            assert.equal(res.result.body.partnerId, partner._id);
            assert.equal(res.result.body.partnerType, partnerType);
            assert.equal(res.result.body.verificationStatus, "REJECTED");
            assert.equal(partner.saved, true);
            assert.deepEqual(calls.userUpdate, [partner.userId, { status: "REJECTED" }]);
        });
    });
}
