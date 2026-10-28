const test = require("node:test");
const assert = require("node:assert/strict");

const User = require("../models/User");
const Manufacturer = require("../models/Manufacturer");
const SupplyChainPartner = require("../models/SupplyChainPartner");
const {
    registerManufacturer,
    registerDistributor,
    registerRetailer
} = require("../controllers/authController");

const baseBody = {
    name: "Test Account",
    email: "test@example.com",
    password: "test-password",
    companyName: "Test Company",
    registrationNumber: "REG-001",
    address: "1 Test Street",
    contactNumber: "+1 555 0100"
};

const responseRecorder = () => {
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
};

async function withModelStubs(run, { duplicate = false } = {}) {
    const originals = {
        findOne: User.findOne,
        userCreate: User.create,
        manufacturerCreate: Manufacturer.create,
        partnerCreate: SupplyChainPartner.create
    };
    const calls = { user: null, profile: null };

    User.findOne = async () => duplicate ? { _id: "existing-user" } : null;
    User.create = async (document) => {
        calls.user = document;
        return { _id: "created-user" };
    };
    Manufacturer.create = async (document) => {
        calls.profile = document;
        return { _id: "created-profile" };
    };
    SupplyChainPartner.create = async (document) => {
        calls.profile = document;
        return { _id: "created-profile" };
    };

    try {
        await run(calls);
    } finally {
        User.findOne = originals.findOne;
        User.create = originals.userCreate;
        Manufacturer.create = originals.manufacturerCreate;
        SupplyChainPartner.create = originals.partnerCreate;
    }
}

const roleCases = [
    {
        role: "manufacturer",
        handler: registerManufacturer,
        userRole: "MANUFACTURER",
        profileType: "manufacturer",
        responseId: "manufacturerId"
    },
    {
        role: "distributor",
        handler: registerDistributor,
        userRole: "DISTRIBUTOR",
        partnerType: "DISTRIBUTOR",
        responseId: "distributorId"
    },
    {
        role: "retailer",
        handler: registerRetailer,
        userRole: "RETAILER",
        partnerType: "RETAILER",
        responseId: "retailerId"
    }
];

for (const item of roleCases) {
    test(`${item.role} registration creates pending account and matching profile`, async () => {
        await withModelStubs(async (calls) => {
            const res = responseRecorder();
            await item.handler({ body: { ...baseBody } }, res);

            assert.equal(res.result.statusCode, 201);
            assert.equal(res.result.body.status, "PENDING");
            assert.equal(res.result.body[item.responseId], "created-profile");
            assert.equal(calls.user.name, baseBody.name);
            assert.equal(calls.user.role, item.userRole);
            assert.equal(calls.user.status, "PENDING");
            assert.notEqual(calls.user.password, baseBody.password);
            assert.equal(calls.profile.userId, "created-user");
            assert.equal(calls.profile.companyName, baseBody.companyName);
            assert.equal(calls.profile.registrationNumber, baseBody.registrationNumber);
            assert.equal(calls.profile.address, baseBody.address);
            assert.equal(calls.profile.contactNumber, baseBody.contactNumber);
            assert.equal(calls.profile.verificationStatus, "PENDING");
            if (item.partnerType) assert.equal(calls.profile.partnerType, item.partnerType);
        });
    });

    test(`${item.role} registration rejects missing required profile data`, async () => {
        await withModelStubs(async (calls) => {
            const body = { ...baseBody };
            delete body.registrationNumber;
            const res = responseRecorder();
            await item.handler({ body }, res);

            assert.equal(res.result.statusCode, 400);
            assert.equal(res.result.body.message, "All required fields must be provided");
            assert.equal(calls.user, null);
            assert.equal(calls.profile, null);
        });
    });

    test(`${item.role} registration reports duplicate email without creating records`, async () => {
        await withModelStubs(async (calls) => {
            const res = responseRecorder();
            await item.handler({ body: { ...baseBody } }, res);

            assert.equal(res.result.statusCode, 400);
            assert.equal(res.result.body.message, "Email is already registered");
            assert.equal(calls.user, null);
            assert.equal(calls.profile, null);
        }, { duplicate: true });
    });
}
