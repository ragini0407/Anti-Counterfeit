const crypto = require("crypto");
const { ethers } = require("ethers");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const SUPPORTED_ROLES = new Set([
    "MANUFACTURER",
    "DISTRIBUTOR",
    "RETAILER"
]);
const SEPOLIA_CHAIN_ID = 11155111;
const WALLET_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const REBIND_CHALLENGE_FIELDS = [
    "walletRebindChallenge",
    "walletRebindChallengeAddress",
    "walletRebindChallengeCurrentAddress",
    "walletRebindChallengeExpiresAt"
];

const rebindChallengeSelection = REBIND_CHALLENGE_FIELDS
    .map((field) => `+${field}`)
    .join(" ");

const clearRebindChallenge = (userId, challenge) => User.findOneAndUpdate(
    { _id: userId, walletRebindChallenge: challenge },
    { $unset: Object.fromEntries(REBIND_CHALLENGE_FIELDS.map((field) => [field, 1])) },
    { new: true }
);

const createWalletChallenge = async (req, res) => {
    let address;
    try {
        address = ethers.getAddress(String(req.body?.address || ""));
    } catch {
        return res.status(400).json({
            message: "A valid Ethereum wallet address is required"
        });
    }

    try {
        const user = await User.findById(req.user.userId).select(
            "+walletChallenge +walletChallengeAddress +walletChallengeExpiresAt"
        );

        if (!user || user.status !== "ACTIVE" || !SUPPORTED_ROLES.has(user.role)) {
            return res.status(403).json({
                message: "An active supply-chain account is required to bind a wallet"
            });
        }

        if (user.walletAddress && user.walletAddress !== address.toLowerCase()) {
            return res.status(409).json({
                message: "A different wallet is already bound to this account"
            });
        }

        const nonce = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + WALLET_CHALLENGE_TTL_MS);
        const message = [
            "Anti-Counterfeit wallet binding",
            `Account: ${user._id}`,
            `Address: ${address}`,
            `Nonce: ${nonce}`,
            `Chain ID: ${SEPOLIA_CHAIN_ID}`,
            `Expires: ${expiresAt.toISOString()}`
        ].join("\n");

        user.walletChallenge = message;
        user.walletChallengeAddress = address.toLowerCase();
        user.walletChallengeExpiresAt = expiresAt;
        await user.save();

        return res.status(200).json({
            message,
            expiresAt: expiresAt.toISOString(),
            chainId: SEPOLIA_CHAIN_ID
        });
    } catch (error) {
        console.error("Wallet challenge error:", error.message);
        return res.status(500).json({
            message: "Wallet challenge could not be created"
        });
    }
};

const confirmWalletBinding = async (req, res) => {
    let address;
    try {
        address = ethers.getAddress(String(req.body?.address || ""));
    } catch {
        return res.status(400).json({
            message: "Wallet address or signature is invalid"
        });
    }

    try {
        const signature = String(req.body?.signature || "");
        const user = await User.findById(req.user.userId).select(
            "+walletChallenge +walletChallengeAddress +walletChallengeExpiresAt"
        );

        if (!user || user.status !== "ACTIVE" || !SUPPORTED_ROLES.has(user.role)) {
            return res.status(403).json({
                message: "An active supply-chain account is required to bind a wallet"
            });
        }

        if (
            !user.walletChallenge ||
            user.walletChallengeAddress !== address.toLowerCase() ||
            !user.walletChallengeExpiresAt ||
            user.walletChallengeExpiresAt.getTime() <= Date.now()
        ) {
            return res.status(400).json({
                message: "Wallet challenge is missing or expired; request a new one"
            });
        }

        const recovered = ethers.verifyMessage(user.walletChallenge, signature);
        if (recovered.toLowerCase() !== address.toLowerCase()) {
            return res.status(401).json({
                message: "Wallet signature does not match the requested address"
            });
        }

        if (user.walletAddress && user.walletAddress !== address.toLowerCase()) {
            return res.status(409).json({
                message: "A different wallet is already bound to this account"
            });
        }

        const otherUser = await User.findOne({
            walletAddress: address.toLowerCase(),
            _id: { $ne: user._id }
        });
        if (otherUser) {
            return res.status(409).json({
                message: "This wallet is already bound to another account"
            });
        }

        user.walletAddress = address.toLowerCase();
        user.walletVerifiedAt = new Date();
        user.walletChallenge = undefined;
        user.walletChallengeAddress = undefined;
        user.walletChallengeExpiresAt = undefined;
        await user.save();

        return res.status(200).json({
            message: "Wallet bound and signature verified",
            walletAddress: address
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "This wallet is already bound to another account"
            });
        }

        if (error.code === "INVALID_ARGUMENT" || error.code === "BAD_DATA") {
            return res.status(400).json({
                message: "Wallet address or signature is invalid"
            });
        }

        console.error("Wallet binding error:", error.message);
        return res.status(500).json({
            message: "Wallet binding could not be completed"
        });
    }
};

const createWalletRebindChallenge = async (req, res) => {
    const addressValue = String(req.body?.address || "");
    const password = req.body?.password;
    let address;

    try {
        address = ethers.getAddress(addressValue);
    } catch {
        return res.status(400).json({ message: "A valid Ethereum wallet address is required" });
    }

    if (typeof password !== "string" || !password) {
        return res.status(400).json({ message: "Password confirmation is required" });
    }

    try {
        const user = await User.findById(req.user.userId).select(`+password ${rebindChallengeSelection}`);
        if (!user || user.status !== "ACTIVE" || !SUPPORTED_ROLES.has(user.role)) {
            return res.status(403).json({ message: "An active supply-chain account is required to rebind a wallet" });
        }

        if (!user.walletAddress || !user.walletVerifiedAt) {
            return res.status(409).json({ message: "Bind and verify a wallet before using wallet rebind" });
        }

        const passwordMatches = await bcrypt.compare(password, user.password);
        if (!passwordMatches) {
            return res.status(401).json({ message: "Password confirmation failed" });
        }

        if (user.walletAddress === address.toLowerCase()) {
            return res.status(400).json({ message: "Choose a different wallet to rebind this account" });
        }

        const nonce = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + WALLET_CHALLENGE_TTL_MS);
        const message = [
            "Anti-Counterfeit wallet rebind",
            "Action: WALLET_REBIND",
            `Account: ${user._id}`,
            `Current address: ${user.walletAddress}`,
            `New address: ${address}`,
            `Nonce: ${nonce}`,
            `Chain ID: ${SEPOLIA_CHAIN_ID}`,
            `Expires: ${expiresAt.toISOString()}`
        ].join("\n");

        user.walletRebindChallenge = message;
        user.walletRebindChallengeAddress = address.toLowerCase();
        user.walletRebindChallengeCurrentAddress = user.walletAddress;
        user.walletRebindChallengeExpiresAt = expiresAt;
        await user.save();

        return res.status(200).json({
            message,
            expiresAt: expiresAt.toISOString(),
            chainId: SEPOLIA_CHAIN_ID
        });
    } catch (error) {
        console.error("Wallet rebind challenge error:", error.message);
        return res.status(500).json({ message: "Wallet rebind challenge could not be created" });
    }
};

const confirmWalletRebind = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select(rebindChallengeSelection);
        if (!user || user.status !== "ACTIVE" || !SUPPORTED_ROLES.has(user.role)) {
            return res.status(403).json({ message: "An active supply-chain account is required to rebind a wallet" });
        }

        const challenge = user.walletRebindChallenge;
        if (!challenge) {
            return res.status(400).json({ message: "Wallet rebind challenge is missing or already used" });
        }

        // Claim and clear the challenge before validating the attempt. This makes
        // every confirmation attempt, including failures, single-use.
        const claimedUser = await clearRebindChallenge(user._id, challenge);
        if (!claimedUser) {
            return res.status(400).json({ message: "Wallet rebind challenge is missing or already used" });
        }

        const expiresAt = user.walletRebindChallengeExpiresAt;
        if (!expiresAt || expiresAt.getTime() <= Date.now()) {
            return res.status(400).json({ message: "Wallet rebind challenge has expired; request a new one" });
        }

        let address;
        try {
            address = ethers.getAddress(String(req.body?.address || ""));
        } catch {
            return res.status(400).json({ message: "Wallet address or signature is invalid" });
        }

        if (address.toLowerCase() !== user.walletRebindChallengeAddress ||
            user.walletAddress !== user.walletRebindChallengeCurrentAddress) {
            return res.status(409).json({ message: "Wallet binding changed or does not match this challenge" });
        }

        let recovered;
        try {
            recovered = ethers.verifyMessage(challenge, String(req.body?.signature || ""));
        } catch {
            return res.status(401).json({ message: "Wallet signature is invalid" });
        }
        if (recovered.toLowerCase() !== address.toLowerCase()) {
            return res.status(401).json({ message: "Wallet signature does not match the requested address" });
        }

        const otherUser = await User.findOne({
            walletAddress: address.toLowerCase(),
            _id: { $ne: user._id }
        });
        if (otherUser) {
            return res.status(409).json({ message: "This wallet is already bound to another account" });
        }

        const updatedUser = await User.findOneAndUpdate(
            { _id: user._id, walletAddress: user.walletRebindChallengeCurrentAddress },
            { $set: { walletAddress: address.toLowerCase(), walletVerifiedAt: new Date() } },
            { new: true }
        );
        if (!updatedUser) {
            return res.status(409).json({ message: "Wallet binding changed; request a new challenge" });
        }

        return res.status(200).json({
            message: "Wallet rebound and signature verified",
            walletAddress: address
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: "This wallet is already bound to another account" });
        }

        console.error("Wallet rebind error:", error.message);
        return res.status(500).json({ message: "Wallet rebind could not be completed" });
    }
};

module.exports = {
    createWalletChallenge,
    confirmWalletBinding,
    createWalletRebindChallenge,
    confirmWalletRebind
};
