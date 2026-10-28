const test = require("node:test");
const assert = require("node:assert/strict");
const { ethers } = require("ethers");
const artifact = require("../../blockchain/artifacts/contracts/ProductRegistry.sol/ProductRegistry.json");
const blockchainService = require("../services/blockchainService");
const productRoutes = require("../routes/productRoutes");
const { protect } = require("../middleware/authMiddleware");
const {
    cleanProductInput,
    resolveSavedRegistrationVersion,
    allocateProductCode,
    prepareProductRegistration,
    claimProductRegistrationMint,
    confirmProductRegistration,
    listPendingProductRegistrations,
    listManufacturerProducts,
    listAllProducts,
    listAllProductsPaginated
} = require("../services/productRegistrationService");

const MANUFACTURER_WALLET = "0x1111111111111111111111111111111111111111";
const DISTRIBUTOR_WALLET = "0x2222222222222222222222222222222222222222";
const RETAILER_WALLET = "0x3333333333333333333333333333333333333333";
const CONTRACT_ADDRESS = "0x4444444444444444444444444444444444444444";
const DELEGATION_MANAGER_ADDRESS = "0x5555555555555555555555555555555555555555";
const ERC7710_INTERFACE = new ethers.Interface([
    "function redeemDelegations(bytes[] _permissionContexts,bytes32[] _modes,bytes[] _executionCallDatas)"
]);
const ERC7710_SINGLE_CALL_MODE = `0x${"00".repeat(32)}`;
const PRODUCT_INPUT = {
    productName: "Example product",
    category: "Food",
    brandName: "Example brand",
    batchNumber: "LOT-1",
    manufacturingDate: "2026-05-01",
    price: "12.5",
    description: "Example description"
};
const REFERENCE_IMAGE = Buffer.from("reference image bytes");

const matchesQuery = (record, query) => Object.entries(query || {}).every(([key, expected]) => {
    if (key === "$or") return expected.some((clause) => matchesQuery(record, clause));
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
        if ("$exists" in expected) return (record[key] !== undefined) === expected.$exists;
        if ("$in" in expected) return expected.$in.includes(record[key]);
    }
    return String(record[key]) === String(expected);
});

const createHarness = (overrides = {}) => {
    let sequence = 0;
    let counterExists = false;
    let createdProducts = [];
    const registrations = [];
    let failNextProductCreate = false;
    let preparedArgs;
    let preparedTransaction;
    const iface = new ethers.Interface(artifact.abi);

    const defaultProduct = {
        _id: "manufacturer-profile-id",
        userId: "manufacturer-user-id",
        verificationStatus: "VERIFIED"
    };
    const base = {
        User: {
            findById: async () => ({
                _id: "manufacturer-user-id",
                role: "MANUFACTURER",
                status: "ACTIVE",
                walletAddress: MANUFACTURER_WALLET,
                walletVerifiedAt: new Date()
            })
        },
        Manufacturer: {
            findOne: async () => defaultProduct
        },
        SupplyChainPartner: {
            findOne: (query) => ({
                populate: async () => ({
                    _id: query._id,
                    partnerType: query.partnerType,
                    verificationStatus: "VERIFIED",
                    companyName: `${query.partnerType} Co`,
                    userId: {
                        _id: `${query.partnerType}-user`,
                        status: "ACTIVE",
                        walletAddress: query.partnerType === "DISTRIBUTOR"
                            ? DISTRIBUTOR_WALLET
                            : RETAILER_WALLET,
                        walletVerifiedAt: new Date()
                    }
                })
            }),
            find: () => ({
                populate: () => ({
                    sort: async () => []
                })
            })
        },
        Product: {
            find: () => ({
                select: () => ({ lean: async () => [] }),
                sort: () => ({ lean: async () => createdProducts })
            }),
            findOne: (query) => ({
                lean: async () => createdProducts.find((record) => matchesQuery(record, query)) || null
            }),
            create: async (product) => {
                if (failNextProductCreate) {
                    failNextProductCreate = false;
                    throw new Error("simulated database failure");
                }
                const saved = {
                    ...product,
                    save: async function save() { return this; }
                };
                if (createdProducts.some((record) =>
                    record.productCode === saved.productCode ||
                    record.transactionHash === saved.transactionHash
                )) {
                    const error = new Error("duplicate product");
                    error.code = 11000;
                    throw error;
                }
                createdProducts.push(saved);
                return saved;
            }
        },
        ProductRegistration: {
            find: (query) => ({
                select: () => ({
                    lean: async () => registrations.filter((record) => matchesQuery(record, query))
                }),
                sort: () => ({
                    lean: async () => registrations.filter((record) => matchesQuery(record, query))
                })
            }),
            findOne: async (query) => registrations.find((record) => matchesQuery(record, query)) || null,
            create: async (registration) => {
                if (registrations.some((record) =>
                    record.registrationId === registration.registrationId ||
                    record.productCode === registration.productCode ||
                    record.idempotencyKey === registration.idempotencyKey &&
                        String(record.manufacturerUserId) === String(registration.manufacturerUserId) ||
                    record.activeRequestKey === registration.activeRequestKey
                )) {
                    const error = new Error("duplicate registration");
                    error.code = 11000;
                    throw error;
                }
                const saved = { ...registration };
                registrations.push(saved);
                return saved;
            },
            findOneAndUpdate: async (query, update) => {
                const registration = registrations.find((record) => matchesQuery(record, query));
                if (!registration) return null;
                Object.assign(registration, update.$set || {});
                Object.keys(update.$unset || {}).forEach((key) => { delete registration[key]; });
                return registration;
            }
        },
        ProductCounter: {
            updateOne: async (_query, update) => {
                if (!counterExists) {
                    sequence = update.$setOnInsert.sequence;
                    counterExists = true;
                }
            },
            findOneAndUpdate: async (_query, update) => {
                sequence += update.$inc.sequence;
                return { sequence };
            }
        },
        Verification: {
            countDocuments: async () => 4,
            aggregate: async () => []
        },
        blockchain: {
            ROLE: { MANUFACTURER: 1, DISTRIBUTOR: 2, RETAILER: 3 },
            SEPOLIA_CHAIN_ID: 11155111,
            CONTRACT_ADDRESS,
            contractInterface: iface,
            getRole: async (wallet) => {
                if (wallet.toLowerCase() === MANUFACTURER_WALLET.toLowerCase()) return 1;
                if (wallet.toLowerCase() === DISTRIBUTOR_WALLET.toLowerCase()) return 2;
                if (wallet.toLowerCase() === RETAILER_WALLET.toLowerCase()) return 3;
                return 0;
            },
            getProductFromBlockchain: async () => null,
            createProductHash: blockchainService.createProductHash,
            createImageHash: blockchainService.createImageHash,
            prepareMintTransaction: async (args) => {
                preparedArgs = args;
                preparedTransaction = {
                    to: CONTRACT_ADDRESS,
                    data: iface.encodeFunctionData("mintProduct", [
                        args.productCode,
                        args.manufacturerId,
                        args.productHash,
                        "",
                        args.authorizedDistributor,
                        args.authorizedRetailer
                    ]),
                    chainId: 11155111,
                    value: "0x0"
                };
                return preparedTransaction;
            },
            waitForMintTransaction: async () => {
                return {
                    receipt: { status: 1, logs: [] },
                    transaction: {
                        chainId: 11155111n,
                        from: MANUFACTURER_WALLET,
                        to: CONTRACT_ADDRESS,
                        data: preparedTransaction.data,
                        value: 0n
                    }
                };
            },
            getMintEvent: (_receipt, code) => ({
                productId: code,
                manufacturerId: preparedArgs.manufacturerId,
                productHash: preparedArgs.productHash,
                ipfsImageHash: "",
                timestamp: 1777593600
            }),
            getProductFromBlockchain: async (code) => code === preparedArgs?.productCode ? ({
                productId: code,
                manufacturerId: preparedArgs.manufacturerId,
                productHash: preparedArgs.productHash,
                ipfsImageHash: "",
                mintedAt: 1777593600,
                state: 0,
                currentOwner: MANUFACTURER_WALLET,
                authorizedDistributor: DISTRIBUTOR_WALLET,
                authorizedRetailer: RETAILER_WALLET
            }) : null
        }
    };

    const deps = {
        ...base,
        ...overrides,
        blockchain: { ...base.blockchain, ...(overrides.blockchain || {}) }
    };
    return {
        deps,
        get preparedArgs() { return preparedArgs; },
        get preparedTransaction() { return preparedTransaction; },
        get createdProducts() { return createdProducts; },
        get registrations() { return registrations; },
        failNextProductCreate() { failNextProductCreate = true; },
        set createdProducts(value) { createdProducts = value; }
    };
};

test("product validation rejects missing fields, invalid dates, and negative price", () => {
    assert.throws(() => cleanProductInput({}), /All product fields are required/);
    assert.throws(
        () => cleanProductInput({ ...PRODUCT_INPUT, manufacturingDate: "not-a-date" }),
        /Manufacturing date is invalid/
    );
    assert.throws(
        () => cleanProductInput({ ...PRODUCT_INPUT, price: "-1" }),
        /non-negative number/
    );
});

test("saved registrations use explicit registry identity and reject ambiguous legacy destinations", () => {
    const deps = {
        blockchain: { CONTRACT_ADDRESS, SEPOLIA_CHAIN_ID: 11155111 },
        blockchainV2: { CONTRACT_ADDRESS: "0x6666666666666666666666666666666666666666", SEPOLIA_CHAIN_ID: 11155111, REGISTRY_VERSION: 2 }
    };
    assert.equal(resolveSavedRegistrationVersion({ registryVersion: 1, preparedTransaction: { to: "0x0000000000000000000000000000000000000000", chainId: 80002 } }, deps), 1);
    assert.equal(resolveSavedRegistrationVersion({ preparedTransaction: { to: CONTRACT_ADDRESS, chainId: 11155111 } }, deps), 1);
    assert.throws(
        () => resolveSavedRegistrationVersion({ preparedTransaction: { to: "0x7777777777777777777777777777777777777777", chainId: 11155111 } }, deps),
        /missing or ambiguous/i
    );
});

test("explicit null price stays null while numeric zero stays zero", () => {
    const nullPrice = cleanProductInput({ ...PRODUCT_INPUT, price: null });
    const zeroPrice = cleanProductInput({ ...PRODUCT_INPUT, price: 0 });

    assert.equal(nullPrice.price, null);
    assert.equal(zeroPrice.price, 0);
    assert.notEqual(
        blockchainService.createProductHash({
            productCode: "FPD0025",
            manufacturerId: "manufacturer-profile-id",
            ...nullPrice
        }),
        blockchainService.createProductHash({
            productCode: "FPD0025",
            manufacturerId: "manufacturer-profile-id",
            ...zeroPrice
        })
    );
});

const makeDelegatedTransaction = (preparedTransaction, overrides = {}) => {
    const target = overrides.target || preparedTransaction.to;
    const value = overrides.value === undefined
        ? BigInt(preparedTransaction.value)
        : BigInt(overrides.value);
    const data = overrides.data || preparedTransaction.data;
    const packedExecution = ethers.solidityPacked(
        ["address", "uint256", "bytes"],
        [target, value, data]
    );
    return {
        chainId: 11155111n,
        from: overrides.from || MANUFACTURER_WALLET,
        to: DELEGATION_MANAGER_ADDRESS,
        data: ERC7710_INTERFACE.encodeFunctionData("redeemDelegations", [
            ["0x1234"],
            [overrides.mode || ERC7710_SINGLE_CALL_MODE],
            [packedExecution]
        ]),
        value: 0n
    };
};

const scopeHarnessToFpd0025Recovery = (harness) => {
    const registration = harness.registrations[0];
    const productCode = "FPD0025";
    registration.product.batchNumber = "FD0100";
    const productHash = blockchainService.createProductHash({
        productCode,
        manufacturerId: String(registration.manufacturerId),
        ...registration.product
    });
    const data = new ethers.Interface(artifact.abi).encodeFunctionData("mintProduct", [
        productCode,
        String(registration.manufacturerId),
        productHash,
        "",
        registration.distributorWallet,
        registration.retailerWallet
    ]);

    registration.registrationId = "68c89b2b-ebec-4370-8f54-545016d020f1";
    registration.productCode = productCode;
    registration.productHash = productHash;
    registration.preparedTransaction.data = data;
    harness.preparedTransaction.data = data;
    harness.preparedArgs.productCode = productCode;
    harness.preparedArgs.productHash = productHash;
    harness.preparedArgs.manufacturerId = String(registration.manufacturerId);
    return registration;
};

test("prepare, confirm, pending-list, and mint-claim routes enforce manufacturer authentication", () => {
    const paths = [
        ["post", "/prepare"],
        ["post", "/confirm"],
        ["get", "/registrations/pending"],
        ["post", "/registrations/:registrationId/claim-mint"]
    ];
    for (const [method, routePath] of paths) {
        const route = productRoutes.stack.find((layer) =>
            layer.route?.path === routePath && layer.route.methods[method]
        )?.route;
        assert.ok(route, `Expected ${method.toUpperCase()} ${routePath}`);
        assert.equal(route.stack[0].handle, protect);
        assert.ok(route.stack.length >= 3);
        const denied = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json() { return this; } };
        let nextCalled = false;
        route.stack[1].handle({ user: { role: "RETAILER" } }, denied, () => { nextCalled = true; });
        assert.equal(denied.statusCode, 403);
        assert.equal(nextCalled, false);
    }
});

test("product IDs are atomically allocated and skip existing on-chain IDs", async () => {
    const harness = createHarness({
        blockchain: {
            getProductFromBlockchain: async (code) => code === "FPD0001" ? { productId: code } : null
        }
    });
    const codes = await Promise.all([
        allocateProductCode(harness.deps),
        allocateProductCode(harness.deps)
    ]);
    assert.deepEqual(codes.sort(), ["FPD0002", "FPD0003"]);
});

async function prepareRegistrationOnly(harness, {
    idempotencyKey = "registration-request-key-0001",
    input = PRODUCT_INPUT,
    imageLoader = async () => REFERENCE_IMAGE
} = {}) {
    const deps = { ...harness.deps, loadReferenceImage: imageLoader };
    const prepared = await prepareProductRegistration({
        userId: "manufacturer-user-id",
        input,
        distributorId: "distributor-profile-id",
        retailerId: "retailer-profile-id",
        idempotencyKey,
        referenceImagePath: "products/reference.png"
    }, deps);
    return { deps, prepared };
}

async function prepareForConfirmation(harness, options = {}) {
    const { deps, prepared } = await prepareRegistrationOnly(harness, options);
    const claimed = await claimProductRegistrationMint({
        userId: "manufacturer-user-id",
        registrationId: prepared.registrationId
    }, deps);
    return { deps, prepared, claimed };
}

test("prepare persists canonical fields, verified wallets, hashes, image path, and calldata before returning", async () => {
    const harness = createHarness();
    const { prepared } = await prepareForConfirmation(harness);

    assert.equal(prepared.productCode, "FPD0001");
    assert.ok(prepared.registrationId);
    assert.equal(prepared.status, "PREPARED");
    assert.match(prepared.productHash, /^[a-f0-9]{64}$/);
    assert.equal(harness.registrations.length, 1);
    assert.equal(harness.registrations[0].manufacturerUserId, "manufacturer-user-id");
    assert.equal(harness.registrations[0].manufacturerId, "manufacturer-profile-id");
    assert.equal(harness.registrations[0].distributorWallet, DISTRIBUTOR_WALLET);
    assert.equal(harness.registrations[0].retailerWallet, RETAILER_WALLET);
    assert.equal(harness.registrations[0].referenceImageHash, blockchainService.createImageHash(REFERENCE_IMAGE));
    assert.equal(harness.registrations[0].preparedTransaction.data, prepared.transaction.data);
    assert.equal(harness.preparedArgs.authorizedDistributor, DISTRIBUTOR_WALLET);
    assert.equal(harness.preparedArgs.authorizedRetailer, RETAILER_WALLET);

    const badRole = createHarness({ blockchain: { getRole: async () => 0 } });
    await assert.rejects(
        prepareForConfirmation(badRole),
        /on-chain manufacturer role/
    );

    const invalidPartner = createHarness({
        blockchain: {
            getRole: async (wallet) => wallet.toLowerCase() === MANUFACTURER_WALLET.toLowerCase()
                ? 1
                : 0
        }
    });
    await assert.rejects(prepareForConfirmation(invalidPartner), /not approved for that role on Sepolia/);
});

test("new registration preparation targets the separately configured V2 registry", async () => {
    const v2Address = "0x6666666666666666666666666666666666666666";
    const base = createHarness();
    const v2 = {
        REGISTRY_VERSION: 2,
        ROLE: { MANUFACTURER: 1, DISTRIBUTOR: 2, RETAILER: 3 },
        SEPOLIA_CHAIN_ID: 11155111,
        CONTRACT_ADDRESS: v2Address,
        getRole: base.deps.blockchain.getRole,
        createImageHash: base.deps.blockchain.createImageHash,
        prepareMintTransaction: async (args) => {
            const transaction = await base.deps.blockchain.prepareMintTransaction(args);
            return { ...transaction, to: v2Address, registryVersion: 2 };
        }
    };
    const harness = createHarness({ blockchainV2: v2 });
    const { prepared } = await prepareRegistrationOnly(harness);
    assert.equal(prepared.registryVersion, 2);
    assert.equal(prepared.transaction.to, v2Address);
    assert.equal(harness.registrations[0].registryVersion, 2);
    assert.equal(harness.registrations[0].preparedTransaction.registryVersion, 2);
});

test("duplicate prepare requests reuse one registration and conflicting reuse is rejected", async () => {
    const harness = createHarness();
    const idempotencyKey = "duplicate-request-key-0001";
    const [first, second] = await Promise.all([
        prepareRegistrationOnly(harness, { idempotencyKey }),
        prepareRegistrationOnly(harness, { idempotencyKey })
    ]);
    assert.equal(first.prepared.registrationId, second.prepared.registrationId);
    assert.equal(harness.registrations.length, 1);

    await assert.rejects(
        prepareProductRegistration({
            userId: "manufacturer-user-id",
            input: { ...PRODUCT_INPUT, productName: "Different product" },
            distributorId: "distributor-profile-id",
            retailerId: "retailer-profile-id",
            idempotencyKey,
            referenceImagePath: "products/other.png"
        }, { ...harness.deps, loadReferenceImage: async () => REFERENCE_IMAGE }),
        /already associated with different registration data/
    );
});

test("only one concurrent mint claim is granted for a registration", async () => {
    const harness = createHarness();
    const prepared = await prepareRegistrationOnly(harness);
    const attempts = await Promise.allSettled([
        claimProductRegistrationMint({ userId: "manufacturer-user-id", registrationId: prepared.prepared.registrationId }, prepared.deps),
        claimProductRegistrationMint({ userId: "manufacturer-user-id", registrationId: prepared.prepared.registrationId }, prepared.deps)
    ]);
    assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((item) => item.status === "rejected").length, 1);
});

test("mint calldata matches the compiled contract ABI argument order", () => {
    const data = blockchainService.encodeMintProductData({
        productCode: "FPD0027",
        manufacturerId: "manufacturer-profile-id",
        productHash: "a".repeat(64),
        ipfsImageHash: "",
        authorizedDistributor: DISTRIBUTOR_WALLET,
        authorizedRetailer: RETAILER_WALLET
    });
    const parsed = new ethers.Interface(artifact.abi).parseTransaction({ data });
    assert.equal(parsed.name, "mintProduct");
    assert.deepEqual(Array.from(parsed.args), [
        "FPD0027",
        "manufacturer-profile-id",
        "a".repeat(64),
        "",
        ethers.getAddress(DISTRIBUTOR_WALLET),
        ethers.getAddress(RETAILER_WALLET)
    ]);
});

test("confirmation validates the saved transaction and persists its product", async () => {
    const harness = createHarness();
    const { deps, prepared } = await prepareForConfirmation(harness);
    const transactionHash = `0x${"a".repeat(64)}`;
    const result = await confirmProductRegistration({
        userId: "manufacturer-user-id",
        registrationId: prepared.registrationId,
        transactionHash,
        qrCode: async () => "/uploads/qrcodes/FPD0001.png"
    }, deps);

    assert.equal(result.productCode, "FPD0001");
    assert.equal(result.referenceImage, "products/reference.png");
    assert.equal(result.imageHash, blockchainService.createImageHash(REFERENCE_IMAGE));
    assert.equal(result.ipfsImageHash, "");
    assert.equal(harness.createdProducts.length, 1);
    assert.equal(harness.registrations[0].status, "COMPLETE");
    assert.equal(harness.registrations[0].transactionHash, transactionHash);
});

test("reverted and mismatched transactions do not persist products", async () => {
    const reverted = createHarness({
        blockchain: { waitForMintTransaction: async () => ({ receipt: { status: 0 }, transaction: {} }) }
    });
    const revertedPending = await prepareForConfirmation(reverted);
    await assert.rejects(
        confirmProductRegistration({
            userId: "manufacturer-user-id",
            registrationId: revertedPending.prepared.registrationId,
            transactionHash: `0x${"b".repeat(64)}`
        }, revertedPending.deps),
        /rejected the product registration transaction/
    );
    assert.equal(reverted.createdProducts.length, 0);

    const wrongSender = createHarness({
        blockchain: {
            waitForMintTransaction: async (_hash, _timeout, tx) => ({
                receipt: { status: 1 },
                transaction: { ...tx, from: RETAILER_WALLET }
            })
        }
    });
    const wrongPending = await prepareForConfirmation(wrongSender);
    wrongSender.deps.blockchain.waitForMintTransaction = async () => ({
        receipt: { status: 1 },
        transaction: {
            chainId: 11155111n,
            from: RETAILER_WALLET,
            to: CONTRACT_ADDRESS,
            data: wrongSender.preparedTransaction.data,
            value: 0n
        }
    });
    await assert.rejects(
        confirmProductRegistration({
            userId: "manufacturer-user-id",
            registrationId: wrongPending.prepared.registrationId,
            transactionHash: `0x${"c".repeat(64)}`
        }, wrongPending.deps),
        /sender, network, or value/
    );
    assert.equal(wrongSender.createdProducts.length, 0);
});

test("confirmation accepts the exact ERC-7710 single-call envelope and repeated confirmation", async () => {
    const harness = createHarness();
    const { deps } = await prepareForConfirmation(harness, {
        input: { ...PRODUCT_INPUT, batchNumber: "FD0100", price: null }
    });
    const registration = scopeHarnessToFpd0025Recovery(harness);
    const transactionHash = "0x5062b95ad501f6da9a66f6253d7c1da77446de9d8c9d9d0f200594f08767f905";
    deps.blockchain.waitForMintTransaction = async () => ({
        receipt: { status: 1, logs: [] },
        transaction: makeDelegatedTransaction(harness.preparedTransaction)
    });

    const input = {
        userId: "manufacturer-user-id",
        registrationId: registration.registrationId,
        transactionHash,
        qrCode: async () => ""
    };
    const first = await confirmProductRegistration(input, deps);
    const repeated = await confirmProductRegistration(input, deps);

    assert.equal(first.productCode, registration.productCode);
    assert.equal(repeated.productCode, registration.productCode);
    assert.equal(harness.createdProducts.length, 1);
    assert.equal(harness.registrations[0].status, "COMPLETE");
    assert.equal(harness.registrations[0].transactionHash, transactionHash);
});

test("delegated execution rejects mismatched embedded target, value, calldata, and mode", async (t) => {
    const variants = [
        ["target", { target: RETAILER_WALLET }],
        ["value", { value: 1n }],
        ["calldata", { data: "0x12345678" }],
        ["mode", { mode: `0x01${"00".repeat(31)}` }]
    ];

    for (const [field, override] of variants) {
        await t.test(field, async () => {
            const harness = createHarness();
            const { deps } = await prepareForConfirmation(harness, {
                input: { ...PRODUCT_INPUT, batchNumber: "FD0100", price: null }
            });
            const registration = scopeHarnessToFpd0025Recovery(harness);
            deps.blockchain.waitForMintTransaction = async () => ({
                receipt: { status: 1, logs: [] },
                transaction: makeDelegatedTransaction(harness.preparedTransaction, override)
            });

            await assert.rejects(
                confirmProductRegistration({
                    userId: "manufacturer-user-id",
                    registrationId: registration.registrationId,
                    transactionHash: "0x5062b95ad501f6da9a66f6253d7c1da77446de9d8c9d9d0f200594f08767f905"
                }, deps),
                /does not contain the exact prepared direct or delegated mint call/
            );
            assert.equal(harness.createdProducts.length, 0);
            assert.equal(harness.registrations[0].status, "MINT_SUBMITTING");
            assert.equal(harness.registrations[0].transactionHash, undefined);
        });
    }
});

test("transaction lookup timeout remains retryable without creating a product", async () => {
    const harness = createHarness();
    const { deps, prepared } = await prepareForConfirmation(harness);
    deps.blockchain.waitForMintTransaction = async () => { throw new Error("temporary RPC failure"); };
    await assert.rejects(
        confirmProductRegistration({
            userId: "manufacturer-user-id",
            registrationId: prepared.registrationId,
            transactionHash: `0x${"e".repeat(64)}`
        }, deps),
        (error) => error.code === "TRANSACTION_CONFIRMATION_PENDING"
    );
    assert.equal(harness.createdProducts.length, 0);
    assert.equal(harness.registrations[0].status, "MINT_SUBMITTING");
});

test("database failure after successful mint is retried with the same transaction", async () => {
    const harness = createHarness();
    const { deps, prepared } = await prepareForConfirmation(harness);
    const transactionHash = `0x${"d".repeat(64)}`;
    harness.failNextProductCreate();

    await assert.rejects(
        confirmProductRegistration({
            userId: "manufacturer-user-id",
            registrationId: prepared.registrationId,
            transactionHash
        }, deps),
        (error) => error.code === "PRODUCT_PERSISTENCE_AFTER_MINT" && error.transactionHash === transactionHash
    );
    assert.equal(harness.registrations[0].status, "MINT_CONFIRMED");
    assert.equal(harness.registrations[0].transactionHash, transactionHash);
    assert.equal(harness.createdProducts.length, 0);

    const result = await confirmProductRegistration({
        userId: "manufacturer-user-id",
        registrationId: prepared.registrationId,
        transactionHash,
        qrCode: async () => ""
    }, deps);
    assert.equal(result.productCode, prepared.productCode);
    assert.equal(harness.createdProducts.length, 1);
    assert.equal(harness.registrations[0].status, "COMPLETE");
});

test("missing or changed saved image fails closed", async () => {
    const claimHarness = createHarness();
    const claimPending = await prepareRegistrationOnly(claimHarness);
    claimPending.deps.loadReferenceImage = async () => Buffer.from("wrong before mint");
    await assert.rejects(
        claimProductRegistrationMint({
            userId: "manufacturer-user-id",
            registrationId: claimPending.prepared.registrationId
        }, claimPending.deps),
        /does not match its prepared hash; mint was not submitted/
    );
    assert.equal(claimHarness.registrations[0].status, "PREPARED");

    const harness = createHarness();
    const { deps, prepared } = await prepareForConfirmation(harness);
    deps.loadReferenceImage = async () => Buffer.from("different image bytes");
    await assert.rejects(
        confirmProductRegistration({
            userId: "manufacturer-user-id",
            registrationId: prepared.registrationId,
            transactionHash: `0x${"f".repeat(64)}`
        }, deps),
        /does not match its prepared hash/
    );
    assert.equal(harness.createdProducts.length, 0);
    assert.equal(harness.registrations[0].status, "MINT_SUBMITTING");

    const missingHarness = createHarness();
    const missing = await prepareForConfirmation(missingHarness);
    missing.deps.loadReferenceImage = async () => {
        const error = new Error("missing persisted file");
        error.code = "REFERENCE_IMAGE_UNAVAILABLE";
        throw error;
    };
    await assert.rejects(
        confirmProductRegistration({
            userId: "manufacturer-user-id",
            registrationId: missing.prepared.registrationId,
            transactionHash: `0x${"7".repeat(64)}`
        }, missing.deps),
        (error) => error.code === "REFERENCE_IMAGE_UNAVAILABLE"
    );
    assert.equal(missingHarness.createdProducts.length, 0);
});

test("a different authenticated manufacturer cannot confirm another account's registration", async () => {
    const harness = createHarness();
    const { deps, prepared } = await prepareForConfirmation(harness);
    await assert.rejects(
        confirmProductRegistration({
            userId: "another-user-id",
            registrationId: prepared.registrationId,
            transactionHash: `0x${"6".repeat(64)}`
        }, deps),
        /not found for this manufacturer/
    );
    assert.equal(harness.createdProducts.length, 0);
    assert.equal(harness.registrations[0].status, "MINT_SUBMITTING");
});

test("concurrent and repeated confirmation of the same hash creates one product; another hash is rejected", async () => {
    const harness = createHarness();
    const { deps, prepared } = await prepareForConfirmation(harness);
    const transactionHash = `0x${"9".repeat(64)}`;
    const input = {
        userId: "manufacturer-user-id",
        registrationId: prepared.registrationId,
        transactionHash,
        qrCode: async () => ""
    };
    const concurrent = await Promise.all([
        confirmProductRegistration(input, deps),
        confirmProductRegistration(input, deps)
    ]);
    assert.equal(concurrent.length, 2);
    assert.equal(harness.createdProducts.length, 1);
    assert.equal(harness.registrations[0].status, "COMPLETE");

    const repeated = await confirmProductRegistration(input, deps);
    assert.equal(repeated.productCode, prepared.productCode);
    assert.equal(harness.createdProducts.length, 1);
    await assert.rejects(
        confirmProductRegistration({ ...input, transactionHash: `0x${"8".repeat(64)}` }, deps),
        /different transaction/
    );
});

test("pending registration listing is scoped to its manufacturer", async () => {
    const harness = createHarness();
    const { deps, prepared } = await prepareRegistrationOnly(harness);
    const pending = await listPendingProductRegistrations("manufacturer-user-id", deps);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].registrationId, prepared.registrationId);
    assert.equal(pending[0].status, "PREPARED");
    const otherAccount = await listPendingProductRegistrations("other-user-id", deps);
    assert.deepEqual(otherAccount, []);
});

test("manufacturer product listing is scoped to the database profile", async () => {
    let requestedFilter;
    const products = [{ productCode: "FPD0001" }];
    const harness = createHarness({
        Manufacturer: { findOne: async () => ({ _id: "manufacturer-profile-id" }) },
        Product: {
            find: (filter) => {
                requestedFilter = filter;
                return { sort: () => ({ lean: async () => products }) };
            }
        },
        Verification: {
            aggregate: async (pipeline) => {
                assert.deepEqual(pipeline[0].$match, { productCode: { $in: ["FPD0001"] } });
                return [
                    { _id: { productCode: "FPD0001", verificationType: "QR", status: "GENUINE", scoringStatus: "SCORED" }, count: 3 },
                    { _id: { productCode: "FPD0001", verificationType: "QR", status: "SUSPICIOUS", scoringStatus: "UNAVAILABLE" }, count: 1 },
                    { _id: { productCode: "FPD0001", verificationType: "IMAGE", status: "FAKE", scoringStatus: "NOT_APPLICABLE" }, count: 2 },
                    { _id: { productCode: "FPD0001", verificationType: "IMAGE", status: "GENUINE", scoringStatus: "NOT_APPLICABLE" }, count: 1 }
                ];
            }
        }
    });
    const result = await listManufacturerProducts("manufacturer-user-id", harness.deps);
    assert.deepEqual(requestedFilter, { manufacturerId: "manufacturer-profile-id" });
    assert.equal(result[0].totalScans, 7);
    assert.equal(result[0].totalVerifications, 7);
    assert.equal(result[0].qrScans, 4);
    assert.equal(result[0].imageVerifications, 3);
    assert.deepEqual(result[0].verificationStatusCounts, {
        GENUINE: 4,
        SUSPICIOUS: 1,
        FAKE: 2,
        NOT_REGISTERED: 0,
        DEACTIVATED: 0,
        FLAGGED: 0,
        INVALID_QR: 0
    });
    assert.deepEqual(result[0].scoringStatusCounts, {
        SCORED: 3,
        INSUFFICIENT_DATA: 0,
        UNAVAILABLE: 1
    });
    assert.equal(result[0].status, "REGISTERED");
    assert.equal(Object.hasOwn(result[0], "genuineScans"), false);
    assert.equal(Object.hasOwn(result[0], "counterfeitScans"), false);
});

test("admin product listing reads MongoDB and joins manufacturer and scan data", async () => {
    const mintedAt = new Date("2026-10-01T00:00:00.000Z");
    const harness = createHarness({
        Product: {
            find: () => ({
                populate: () => ({
                    sort: () => ({
                        lean: async () => [{
                            productCode: "FPD0001",
                            manufacturerId: { _id: "manufacturer-profile-id", companyName: "Acme" },
                            mintedAt
                        }]
                    })
                })
            })
        },
        Verification: {
            aggregate: async () => [
                { _id: { productCode: "FPD0001", verificationType: "QR", status: "GENUINE", scoringStatus: "INSUFFICIENT_DATA" }, count: 3 }
            ]
        }
    });
    const products = await listAllProducts(harness.deps);
    assert.equal(products.length, 1);
    assert.equal(products[0].manufacturer, "Acme");
    assert.equal(products[0].totalScans, 3);
    assert.equal(products[0].qrScans, 3);
    assert.equal(products[0].imageVerifications, 0);
    assert.equal(products[0].timestamp, mintedAt.toISOString());
});

test("admin product pagination applies server-side skip and limit and enriches only the returned page", async () => {
    const calls = {};
    const harness = createHarness({
        Product: {
            countDocuments: async () => 42,
            find: () => ({
                populate: () => ({
                    sort: (sort) => {
                        calls.sort = sort;
                        return {
                            skip: (skip) => {
                                calls.skip = skip;
                                return {
                                    limit: (limit) => {
                                        calls.limit = limit;
                                        return { lean: async () => [{ productCode: "FPD0021", manufacturerId: { _id: "m1", companyName: "Acme" } }] };
                                    }
                                };
                            }
                        };
                    }
                })
            })
        },
        Verification: {
            aggregate: async () => []
        }
    });
    const result = await listAllProductsPaginated({ page: 3, pageSize: 10 }, harness.deps);
    assert.equal(calls.skip, 20);
    assert.equal(calls.limit, 10);
    assert.deepEqual(result.pagination, { page: 3, pageSize: 10, total: 42, totalPages: 5 });
    assert.equal(result.products.length, 1);
    assert.equal(result.products[0].productCode, "FPD0021");
    assert.equal(result.products[0].totalVerifications, 0);
});
