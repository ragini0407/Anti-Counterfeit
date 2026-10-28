const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { ethers } = require("ethers");

const User = require("../models/User");
const authRoutes = require("../routes/authRoutes");
const { protect } = require("../middleware/authMiddleware");
const {
    createWalletRebindChallenge,
    confirmWalletRebind
} = require("../controllers/walletController");

const AUTHENTICATED_USER_ID = "authenticated-user";
const OTHER_USER_ID = "another-user";

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

function getRoute(routePath) {
    const layer = authRoutes.stack.find(
        (item) => item.route?.path === routePath && item.route.methods.post
    );
    assert.ok(layer, `Expected POST ${routePath} to exist`);
    return layer.route;
}

function makeUser({ walletAddress, challengeExpiresAt = new Date(Date.now() + 5 * 60 * 1000) }) {
    return {
        _id: AUTHENTICATED_USER_ID,
        name: "Test Manufacturer",
        email: "manufacturer@example.test",
        password: null,
        role: "MANUFACTURER",
        status: "ACTIVE",
        walletAddress: walletAddress.toLowerCase(),
        walletVerifiedAt: new Date(),
        walletRebindChallenge: undefined,
        walletRebindChallengeAddress: undefined,
        walletRebindChallengeCurrentAddress: undefined,
        walletRebindChallengeExpiresAt: undefined,
        async save() {}
    };
}

async function withUserStubs(user, run, { duplicateWallet = false } = {}) {
    const originals = {
        findById: User.findById,
        findOne: User.findOne,
        findOneAndUpdate: User.findOneAndUpdate
    };
    const calls = { findById: [], updates: [] };
    let consumedChallenge = null;

    User.findById = (id) => {
        calls.findById.push(id);
        return {
            select: () => {
                if (consumedChallenge && user.walletRebindChallenge === consumedChallenge) {
                    return Promise.resolve({
                        ...user,
                        walletRebindChallenge: undefined,
                        walletRebindChallengeAddress: undefined,
                        walletRebindChallengeCurrentAddress: undefined,
                        walletRebindChallengeExpiresAt: undefined
                    });
                }
                return Promise.resolve(user);
            }
        };
    };
    User.findOne = async (query) => {
        calls.findOneQuery = query;
        return duplicateWallet ? { _id: OTHER_USER_ID } : null;
    };
    User.findOneAndUpdate = async (query, update) => {
        calls.updates.push({ query, update });
        if (update.$unset) {
            if (query._id !== user._id || query.walletRebindChallenge !== user.walletRebindChallenge || consumedChallenge) return null;
            consumedChallenge = query.walletRebindChallenge;
            const claimedUser = { ...user };
            for (const key of Object.keys(update.$unset)) claimedUser[key] = undefined;
            return claimedUser;
        }
        if (query._id !== user._id || query.walletAddress !== user.walletAddress) return null;
        Object.assign(user, update.$set);
        return user;
    };

    try {
        await run(calls);
    } finally {
        User.findById = originals.findById;
        User.findOne = originals.findOne;
        User.findOneAndUpdate = originals.findOneAndUpdate;
    }
}

async function createChallenge(user, wallet, calls) {
    user.password = await bcrypt.hash("correct-password", 4);
    const res = responseRecorder();
    await createWalletRebindChallenge(
        {
            user: { userId: AUTHENTICATED_USER_ID },
            body: {
                address: wallet.address,
                password: "correct-password",
                accountId: OTHER_USER_ID
            }
        },
        res
    );
    assert.equal(res.result.statusCode, 200);
    assert.equal(calls.findById.at(-1), AUTHENTICATED_USER_ID);
    return res.result.body.message;
}

test("rebind routes require authentication and supply-chain role authorization", () => {
    for (const routePath of ["/wallet/rebind/challenge", "/wallet/rebind/confirm"]) {
        const route = getRoute(routePath);
        assert.equal(route.stack[0].handle, protect);
        assert.equal(route.stack.length, 3);

        const unauthenticated = responseRecorder();
        let nextCalled = false;
        route.stack[0].handle({ headers: {} }, unauthenticated, () => { nextCalled = true; });
        assert.equal(unauthenticated.result.statusCode, 401);
        assert.equal(nextCalled, false);

        const roleDenied = responseRecorder();
        let roleNextCalled = false;
        route.stack[1].handle({ user: { role: "ADMIN" } }, roleDenied, () => { roleNextCalled = true; });
        assert.equal(roleDenied.result.statusCode, 403);
        assert.equal(roleNextCalled, false);
    }
});

test("authenticated account can rebind after password and fresh new-wallet signature; supplied account ID is ignored", async () => {
    const oldWallet = ethers.Wallet.createRandom();
    const newWallet = ethers.Wallet.createRandom();
    const user = makeUser({ walletAddress: oldWallet.address });

    await withUserStubs(user, async (calls) => {
        const challenge = await createChallenge(user, newWallet, calls);
        const signature = await newWallet.signMessage(challenge);
        const res = responseRecorder();
        await confirmWalletRebind(
            {
                user: { userId: AUTHENTICATED_USER_ID },
                body: { address: newWallet.address, signature, accountId: OTHER_USER_ID }
            },
            res
        );

        assert.equal(res.result.statusCode, 200);
        assert.equal(user.walletAddress, newWallet.address.toLowerCase());
        assert.ok(user.walletVerifiedAt instanceof Date);
        assert.equal(calls.findById.every((id) => id === AUTHENTICATED_USER_ID), true);
        assert.equal(calls.updates.some(({ query, update }) =>
            query._id === OTHER_USER_ID || update.$set?.walletAddress === oldWallet.address.toLowerCase()
        ), false);
    });
});

test("invalid signature consumes the rebind challenge so it cannot be replayed", async () => {
    const oldWallet = ethers.Wallet.createRandom();
    const newWallet = ethers.Wallet.createRandom();
    const wrongSigner = ethers.Wallet.createRandom();
    const user = makeUser({ walletAddress: oldWallet.address });

    await withUserStubs(user, async (calls) => {
        const challenge = await createChallenge(user, newWallet, calls);
        const signature = await wrongSigner.signMessage(challenge);
        const first = responseRecorder();
        await confirmWalletRebind({ user: { userId: AUTHENTICATED_USER_ID }, body: { address: newWallet.address, signature } }, first);
        assert.equal(first.result.statusCode, 401);
        assert.equal(user.walletAddress, oldWallet.address.toLowerCase());

        const replay = responseRecorder();
        await confirmWalletRebind({ user: { userId: AUTHENTICATED_USER_ID }, body: { address: newWallet.address, signature } }, replay);
        assert.equal(replay.result.statusCode, 400);
        assert.equal(user.walletAddress, oldWallet.address.toLowerCase());
    });
});

test("expired rebind challenge is consumed and cannot be replayed", async () => {
    const oldWallet = ethers.Wallet.createRandom();
    const newWallet = ethers.Wallet.createRandom();
    const user = makeUser({ walletAddress: oldWallet.address });

    await withUserStubs(user, async (calls) => {
        await createChallenge(user, newWallet, calls);
        const challenge = user.walletRebindChallenge;
        const signature = await newWallet.signMessage(challenge);
        user.walletRebindChallengeExpiresAt = new Date(Date.now() - 1000);

        const first = responseRecorder();
        await confirmWalletRebind({ user: { userId: AUTHENTICATED_USER_ID }, body: { address: newWallet.address, signature } }, first);
        assert.equal(first.result.statusCode, 400);
        assert.match(first.result.body.message, /expired/i);

        const replay = responseRecorder();
        await confirmWalletRebind({ user: { userId: AUTHENTICATED_USER_ID }, body: { address: newWallet.address, signature } }, replay);
        assert.equal(replay.result.statusCode, 400);
        assert.equal(user.walletAddress, oldWallet.address.toLowerCase());
    });
});

test("wallet already owned by another account is rejected and challenge is consumed", async () => {
    const oldWallet = ethers.Wallet.createRandom();
    const newWallet = ethers.Wallet.createRandom();
    const user = makeUser({ walletAddress: oldWallet.address });

    await withUserStubs(user, async (calls) => {
        const challenge = await createChallenge(user, newWallet, calls);
        const signature = await newWallet.signMessage(challenge);
        const res = responseRecorder();
        await confirmWalletRebind({ user: { userId: AUTHENTICATED_USER_ID }, body: { address: newWallet.address, signature } }, res);

        assert.equal(res.result.statusCode, 409);
        assert.match(res.result.body.message, /already bound/i);
        assert.equal(user.walletAddress, oldWallet.address.toLowerCase());
        assert.equal(calls.updates.filter(({ update }) => update.$set?.walletAddress).length, 0);
    }, { duplicateWallet: true });
});

test("successful rebind challenge cannot be replayed", async () => {
    const oldWallet = ethers.Wallet.createRandom();
    const newWallet = ethers.Wallet.createRandom();
    const user = makeUser({ walletAddress: oldWallet.address });

    await withUserStubs(user, async (calls) => {
        const challenge = await createChallenge(user, newWallet, calls);
        const signature = await newWallet.signMessage(challenge);
        const first = responseRecorder();
        await confirmWalletRebind({ user: { userId: AUTHENTICATED_USER_ID }, body: { address: newWallet.address, signature } }, first);
        assert.equal(first.result.statusCode, 200);

        const replay = responseRecorder();
        await confirmWalletRebind({ user: { userId: AUTHENTICATED_USER_ID }, body: { address: newWallet.address, signature } }, replay);
        assert.equal(replay.result.statusCode, 400);
        assert.equal(user.walletAddress, newWallet.address.toLowerCase());
    });
});
