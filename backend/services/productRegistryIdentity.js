const normalizeAddress = (value) => {
    if (typeof value !== "string" || !/^0x[\da-fA-F]{40}$/.test(value)) return null;
    return value.toLowerCase();
};

const sameId = (left, right) => {
    const id = (value) => String(value?._id || value || "");
    return Boolean(id(left) && id(right) && id(left) === id(right));
};

const getConfiguredRegistries = ({ blockchainV1, blockchainV2 }) => [
    {
        version: 1,
        address: normalizeAddress(blockchainV1?.CONTRACT_ADDRESS),
        chainId: Number(blockchainV1?.CHAIN_ID || blockchainV1?.SEPOLIA_CHAIN_ID || 0)
    },
    {
        version: 2,
        address: normalizeAddress(blockchainV2?.CONTRACT_ADDRESS),
        chainId: Number(blockchainV2?.SEPOLIA_CHAIN_ID || 0)
    }
].filter((registry) => registry.address && registry.chainId);

const resolveProductRegistryIdentity = ({ product, registration, blockchainV1, blockchainV2 }) => {
    if (!product) return { status: "UNRESOLVED", reason: "PRODUCT_MISSING" };
    const configuredRegistries = getConfiguredRegistries({ blockchainV1, blockchainV2 });
    const productAddress = normalizeAddress(product.registryAddress);
    const productChainId = Number(product.chainId || 0);
    const productVersion = Number(product.registryVersion || 0);

    const registrationMatchesProduct = Boolean(
        registration &&
        registration.status === "COMPLETE" &&
        registration.productCode === product.productCode &&
        registration.transactionHash &&
        registration.transactionHash === product.transactionHash &&
        sameId(registration.manufacturerId, product.manufacturerId)
    );

    let registrationIdentity = null;
    if (registrationMatchesProduct) {
        const prepared = registration.preparedTransaction || {};
        const address = normalizeAddress(prepared.to);
        const chainId = Number(prepared.chainId || 0);
        let version = Number(registration.registryVersion || prepared.registryVersion || 0);
        if (!version && address && chainId) {
            const candidates = configuredRegistries.filter((candidate) => candidate.address === address && candidate.chainId === chainId);
            if (candidates.length === 1) version = candidates[0].version;
        }
        if ([1, 2].includes(version) && address && chainId) {
            registrationIdentity = { version, address, chainId, source: "COMPLETED_REGISTRATION_TRANSACTION" };
        }
    }

    if (registrationIdentity && (
        (productVersion && productVersion !== registrationIdentity.version) ||
        (productAddress && productAddress !== registrationIdentity.address) ||
        (productChainId && productChainId !== registrationIdentity.chainId)
    )) {
        return { status: "UNRESOLVED", reason: "PRODUCT_AND_REGISTRATION_IDENTITY_CONFLICT" };
    }

    if (productVersion && productAddress && productChainId) {
        return {
            status: "RESOLVED",
            version: productVersion,
            address: productAddress,
            chainId: productChainId,
            source: "PRODUCT_RECORD"
        };
    }
    if (registrationIdentity) return { status: "RESOLVED", ...registrationIdentity };

    if (!productVersion && productAddress && productChainId) {
        const candidates = configuredRegistries.filter((candidate) =>
            candidate.address === productAddress && candidate.chainId === productChainId
        );
        if (candidates.length === 1) {
            return { status: "RESOLVED", ...candidates[0], source: "PRODUCT_ADDRESS_MATCHES_SINGLE_CONFIGURED_REGISTRY" };
        }
    }

    return {
        status: "UNRESOLVED",
        reason: productVersion || productAddress || productChainId
            ? "INCOMPLETE_OR_AMBIGUOUS_REGISTRY_IDENTITY"
            : "HISTORICAL_REGISTRY_PROVENANCE_MISSING"
    };
};

module.exports = { resolveProductRegistryIdentity };
