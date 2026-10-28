const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdmin, MIN_PASSWORD_LENGTH } = require("../seedAdmin");
const UserModel = require("../models/User");

const validConfig = () => ({
    ADMIN_BOOTSTRAP_NAME: "Provisioned Admin",
    ADMIN_BOOTSTRAP_EMAIL: "admin@example.test",
    ADMIN_BOOTSTRAP_PASSWORD: "x".repeat(MIN_PASSWORD_LENGTH)
});

test("admin bootstrap fails closed when one-time configuration is missing", async () => {
    let connected = false;
    let creates = 0;
    await assert.rejects(
        createAdmin({
            env: {},
            User: {
                init: async () => {},
                findOne: async () => null,
                create: async () => { creates += 1; }
            },
            connectDB: async () => { connected = true; }
        }),
        (error) => error.code === "BOOTSTRAP_CONFIGURATION_REQUIRED"
    );
    assert.equal(connected, true);
    assert.equal(creates, 0);
});

test("admin bootstrap rejects short passwords without creating an account", async () => {
    let connected = false;
    await assert.rejects(
        createAdmin({
            env: { ...validConfig(), ADMIN_BOOTSTRAP_PASSWORD: "too-short" },
            User: { init: async () => {}, findOne: async () => null },
            connectDB: async () => { connected = true; }
        }),
        (error) => error.code === "BOOTSTRAP_PASSWORD_TOO_SHORT"
    );
    assert.equal(connected, true);
    assert.ok(MIN_PASSWORD_LENGTH >= 16);
});

test("admin bootstrap creates once and repeat execution does not create another account", async () => {
    const users = [];
    let connects = 0;
    const User = {
        init: async () => {},
        findOne: async (filter) => filter.role === "ADMIN"
            ? users.find((user) => user.role === "ADMIN") || null
            : users.find((user) => user.email === filter.email) || null,
        create: async (record) => {
            users.push(record);
            return record;
        }
    };
    const bcryptImpl = { hash: async (value, rounds) => `hashed:${rounds}:${value.length}` };
    const dependencies = {
        env: validConfig(),
        User,
        bcryptImpl,
        connectDB: async () => { connects += 1; }
    };

    assert.deepEqual(await createAdmin(dependencies), { created: true });
    assert.deepEqual(await createAdmin(dependencies), { created: false, reason: "ADMIN_ALREADY_EXISTS" });
    assert.deepEqual(await createAdmin({ ...dependencies, env: {} }), { created: false, reason: "ADMIN_ALREADY_EXISTS" });
    assert.equal(users.length, 1);
    assert.equal(users[0].role, "ADMIN");
    assert.equal(users[0].status, "ACTIVE");
    assert.equal(users[0].email, "admin@example.test");
    assert.match(users[0].password, /^hashed:12:/);
    assert.equal(connects, 3);
});

test("admin bootstrap refuses to take over an existing non-admin email", async () => {
    const User = {
        init: async () => {},
        findOne: async (filter) => filter.role === "ADMIN" ? null : { _id: "existing-user" },
        create: async () => assert.fail("must not create or overwrite an account")
    };
    await assert.rejects(
        createAdmin({ env: validConfig(), User, connectDB: async () => {} }),
        (error) => error.code === "BOOTSTRAP_EMAIL_IN_USE"
    );
});

test("User schema enforces one ADMIN role with a partial unique index", () => {
    const adminIndex = UserModel.schema.indexes().find(([keys, options]) =>
        keys.role === 1 && options.unique === true && options.partialFilterExpression?.role === "ADMIN"
    );
    assert.ok(adminIndex, "a database-level partial unique ADMIN index is required");
});

test("concurrent bootstrap runs with different emails produce only one admin", async () => {
    const users = [];
    let creates = 0;
    const User = {
        init: async () => {},
        findOne: async (filter) => filter.role === "ADMIN"
            ? users.find((user) => user.role === "ADMIN") || null
            : users.find((user) => user.email === filter.email) || null,
        create: async (record) => {
            creates += 1;
            if (users.some((user) => user.role === "ADMIN")) {
                throw Object.assign(new Error("duplicate admin index"), { code: 11000 });
            }
            users.push(record);
            return record;
        }
    };
    const makeEnv = (email) => ({
        ADMIN_BOOTSTRAP_NAME: "Operator",
        ADMIN_BOOTSTRAP_EMAIL: email,
        ADMIN_BOOTSTRAP_PASSWORD: "x".repeat(MIN_PASSWORD_LENGTH)
    });
    const results = await Promise.all([
        createAdmin({ env: makeEnv("first@example.test"), User, bcryptImpl: { hash: async () => "hash" }, connectDB: async () => {} }),
        createAdmin({ env: makeEnv("second@example.test"), User, bcryptImpl: { hash: async () => "hash" }, connectDB: async () => {} })
    ]);
    assert.equal(users.filter((user) => user.role === "ADMIN").length, 1);
    assert.equal(creates, 2);
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(results.filter((result) => result.reason === "ADMIN_ALREADY_EXISTS").length, 1);
});
