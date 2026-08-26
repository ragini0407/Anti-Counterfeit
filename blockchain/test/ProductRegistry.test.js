const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("ProductRegistry", function () {
  let ProductRegistry, registry, admin, manufacturer, otherManufacturer, stranger;

  const PRODUCT_ID = "PROD-0001";
  const PRODUCT_HASH = "0x" + "a".repeat(64);

  beforeEach(async function () {
    [admin, manufacturer, otherManufacturer, stranger] = await ethers.getSigners();
    ProductRegistry = await ethers.getContractFactory("ProductRegistry");
    registry = await ProductRegistry.deploy();
    await registry.waitForDeployment();
  });

  describe("Admin & manufacturer approval", function () {
    it("sets deployer as admin", async function () {
      expect(await registry.admin()).to.equal(admin.address);
    });

    it("allows admin to approve a manufacturer", async function () {
      await expect(registry.approveManufacturer(manufacturer.address))
        .to.emit(registry, "ManufacturerApproved")
        .withArgs(manufacturer.address);
      expect(await registry.approvedManufacturers(manufacturer.address)).to.equal(true);
    });

    it("rejects approval attempts from non-admin", async function () {
      await expect(
        registry.connect(stranger).approveManufacturer(manufacturer.address)
      ).to.be.revertedWith("ProductRegistry: caller is not admin");
    });

    it("allows admin to revoke a manufacturer", async function () {
      await registry.approveManufacturer(manufacturer.address);
      await registry.revokeManufacturer(manufacturer.address);
      expect(await registry.approvedManufacturers(manufacturer.address)).to.equal(false);
    });
  });

  describe("Product registration", function () {
    beforeEach(async function () {
      await registry.approveManufacturer(manufacturer.address);
    });

    it("allows an approved manufacturer to register a product", async function () {
      await expect(
        registry.connect(manufacturer).registerProduct(PRODUCT_ID, PRODUCT_HASH)
      )
        .to.emit(registry, "ProductRegistered")
        .withArgs(PRODUCT_ID, manufacturer.address, PRODUCT_HASH, anyValue);
    });

    it("rejects registration from a non-approved manufacturer", async function () {
      await expect(
        registry.connect(otherManufacturer).registerProduct(PRODUCT_ID, PRODUCT_HASH)
      ).to.be.revertedWith("ProductRegistry: manufacturer not approved");
    });

    it("rejects an empty productId", async function () {
      await expect(
        registry.connect(manufacturer).registerProduct("", PRODUCT_HASH)
      ).to.be.revertedWith("ProductRegistry: empty productId");
    });

    it("rejects duplicate product registration", async function () {
      await registry.connect(manufacturer).registerProduct(PRODUCT_ID, PRODUCT_HASH);
      await expect(
        registry.connect(manufacturer).registerProduct(PRODUCT_ID, PRODUCT_HASH)
      ).to.be.revertedWith("ProductRegistry: product already registered");
    });
  });

  describe("Product retrieval & verification", function () {
    beforeEach(async function () {
      await registry.approveManufacturer(manufacturer.address);
      await registry.connect(manufacturer).registerProduct(PRODUCT_ID, PRODUCT_HASH);
    });

    it("returns correct product data via getProduct", async function () {
      const result = await registry.getProduct(PRODUCT_ID);
      expect(result[0]).to.equal(PRODUCT_ID);
      expect(result[1]).to.equal(manufacturer.address);
      expect(result[2]).to.equal(PRODUCT_HASH);
      expect(result[4]).to.equal(1);
    });

    it("reverts when fetching a product that does not exist", async function () {
      await expect(registry.getProduct("NON-EXISTENT")).to.be.revertedWith(
        "ProductRegistry: product does not exist"
      );
    });

    it("verifyProduct returns exists=true and hashMatches=true for a correct hash", async function () {
      const [exists, hashMatches, isFlagged] = await registry.verifyProduct(
        PRODUCT_ID,
        PRODUCT_HASH
      );
      expect(exists).to.equal(true);
      expect(hashMatches).to.equal(true);
      expect(isFlagged).to.equal(false);
    });

    it("verifyProduct returns hashMatches=false for a tampered hash", async function () {
      const wrongHash = "0x" + "b".repeat(64);
      const [exists, hashMatches] = await registry.verifyProduct(PRODUCT_ID, wrongHash);
      expect(exists).to.equal(true);
      expect(hashMatches).to.equal(false);
    });

    it("verifyProduct returns exists=false for an unregistered product", async function () {
      const [exists] = await registry.verifyProduct("GHOST-ID", PRODUCT_HASH);
      expect(exists).to.equal(false);
    });
  });

  describe("Flagging counterfeit/suspicious products", function () {
    beforeEach(async function () {
      await registry.approveManufacturer(manufacturer.address);
      await registry.connect(manufacturer).registerProduct(PRODUCT_ID, PRODUCT_HASH);
    });

    it("allows admin to flag a product", async function () {
      await expect(registry.flagProduct(PRODUCT_ID))
        .to.emit(registry, "ProductFlagged")
        .withArgs(PRODUCT_ID);
      const [, , isFlagged] = await registry.verifyProduct(PRODUCT_ID, PRODUCT_HASH);
      expect(isFlagged).to.equal(true);
    });

    it("rejects flagging from non-admin", async function () {
      await expect(
        registry.connect(stranger).flagProduct(PRODUCT_ID)
      ).to.be.revertedWith("ProductRegistry: caller is not admin");
    });

    it("rejects flagging a product that doesn't exist", async function () {
      await expect(registry.flagProduct("GHOST-ID")).to.be.revertedWith(
        "ProductRegistry: product does not exist"
      );
    });
  });
});
