const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProductRegistry", function () {
  let contract;
  let admin;
  let manufacturer;
  let distributor;
  let retailer;
  let consumer;

  beforeEach(async function () {
    [admin, manufacturer, distributor, retailer, consumer] =
      await ethers.getSigners();

    const ProductRegistry =
      await ethers.getContractFactory("ProductRegistry");
    contract = await ProductRegistry.deploy();
    await contract.waitForDeployment();

    // Request and approve all roles
    await contract
      .connect(manufacturer)
      .requestRole(1, "ABC Pharma");
    await contract.approveRole(manufacturer.address);

    await contract
      .connect(distributor)
      .requestRole(2, "XYZ Logistics");
    await contract.approveRole(distributor.address);

    await contract
      .connect(retailer)
      .requestRole(3, "PQR Store");
    await contract.approveRole(retailer.address);
  });

  // ── Role Tests ─────────────────────────────────────────
  describe("Role Management", function () {
    it("Should set deployer as admin", async function () {
      expect(await contract.admin()).to.equal(admin.address);
    });

    it("Should approve manufacturer role", async function () {
      expect(await contract.getRole(manufacturer.address))
        .to.equal(1); // MANUFACTURER
    });

    it("Should approve distributor role", async function () {
      expect(await contract.getRole(distributor.address))
        .to.equal(2); // DISTRIBUTOR
    });

    it("Should approve retailer role", async function () {
      expect(await contract.getRole(retailer.address))
        .to.equal(3); // RETAILER
    });

    it("Should revoke a role", async function () {
      await contract.revokeRole(manufacturer.address);
      expect(await contract.getRole(manufacturer.address))
        .to.equal(0); // NONE
    });

    it("Should reject role request from non-admin", async function () {
      await expect(
        contract.connect(consumer).approveRole(consumer.address)
      ).to.be.revertedWith("Only admin");
    });
  });

  // ── Product Lifecycle Tests ────────────────────────────
  describe("Product Lifecycle", function () {
    const productId   = "PROD-2026-TEST01";
    const mfrId       = "MFR-0001";
    const hash        = "abc123hash456";
    const ipfsHash    = "QmTest123";

    beforeEach(async function () {
      // Mint product
      await contract
        .connect(manufacturer)
        .mintProduct(productId, mfrId, hash, ipfsHash);
    });

    it("Should mint product in MINTED state", async function () {
      const state = await contract.getProductState(productId);
      expect(state).to.equal(0); // MINTED
    });

    it("Should reject duplicate product ID", async function () {
      await expect(
        contract
          .connect(manufacturer)
          .mintProduct(productId, mfrId, hash, ipfsHash)
      ).to.be.revertedWith("Product already minted");
    });

    it("Should reject mint from non-manufacturer", async function () {
      await expect(
        contract
          .connect(consumer)
          .mintProduct("PROD-999", mfrId, hash, ipfsHash)
      ).to.be.revertedWith("Only manufacturer");
    });

    it("Distributor should update to IN_TRANSIT", async function () {
      await contract
        .connect(distributor)
        .transferCustody(productId);
      const state = await contract.getProductState(productId);
      expect(state).to.equal(1); // IN_TRANSIT
    });

    it("Should reject transferCustody from non-distributor",
      async function () {
        await expect(
          contract.connect(consumer).transferCustody(productId)
        ).to.be.revertedWith("Only distributor");
      }
    );

    it("Retailer should mark RECEIVED_BY_RETAILER",
      async function () {
        await contract
          .connect(distributor)
          .transferCustody(productId);
        await contract
          .connect(retailer)
          .receiveAtRetail(productId);
        const state = await contract.getProductState(productId);
        expect(state).to.equal(2); // RECEIVED_BY_RETAILER
      }
    );

    it("Should reject receiveAtRetail from non-retailer",
      async function () {
        await contract
          .connect(distributor)
          .transferCustody(productId);
        await expect(
          contract.connect(consumer).receiveAtRetail(productId)
        ).to.be.revertedWith("Only retailer");
      }
    );

    it("Consumer verifyAndPurchase should mark SOLD",
      async function () {
        await contract
          .connect(distributor)
          .transferCustody(productId);
        await contract
          .connect(retailer)
          .receiveAtRetail(productId);

        const result = await contract
          .connect(consumer)
          .verifyAndPurchase.staticCall(
            productId, hash, "Mumbai", 1900000, 7200000
          );

        expect(result[0]).to.equal(true);  // genuine
        expect(result[1]).to.equal(false); // not already sold
        expect(result[2]).to.equal(false); // not flagged
      }
    );

    it("Should flag already sold product on rescan",
      async function () {
        await contract
          .connect(distributor)
          .transferCustody(productId);
        await contract
          .connect(retailer)
          .receiveAtRetail(productId);

        // First scan - marks SOLD
        await contract
          .connect(consumer)
          .verifyAndPurchase(
            productId, hash, "Mumbai", 1900000, 7200000
          );

        // Second scan - already sold
        const result = await contract
          .connect(consumer)
          .verifyAndPurchase.staticCall(
            productId, hash, "Mumbai", 1900000, 7200000
          );

        expect(result[1]).to.equal(true); // alreadySold
      }
    );

    it("Should detect velocity anomaly and flag counterfeit",
  async function () {
    await contract
      .connect(distributor)
      .transferCustody(productId);
    await contract
      .connect(retailer)
      .receiveAtRetail(productId);

    // First scan in Mumbai - marks as SOLD
    await contract
      .connect(consumer)
      .verifyAndPurchase(
        productId, hash, "Mumbai", 1900000, 7200000
      );

    // Mine a new block to advance time
    await ethers.provider.send("evm_increaseTime", [60]);
    await ethers.provider.send("evm_mine");

    // Immediate scan in Delhi = impossible travel
    // Same product, different city, within 5 minutes
    await contract
      .connect(consumer)
      .verifyAndPurchase(
        productId, hash, "Delhi", 2860000, 7720000
      );

    // Check state is now FLAGGED_COUNTERFEIT
    const state = await contract.getProductState(productId);
    expect(state).to.equal(4); // FLAGGED_COUNTERFEIT
  }
);

    it("Admin should flag product as counterfeit",
      async function () {
        await contract.flagCounterfeit(productId, "Fake detected");
        const state = await contract.getProductState(productId);
        expect(state).to.equal(4); // FLAGGED_COUNTERFEIT
      }
    );

    it("Should reject flagging from non-admin", async function () {
      await expect(
        contract
          .connect(consumer)
          .flagCounterfeit(productId, "test")
      ).to.be.revertedWith("Only admin");
    });
  });

  // ── View Function Tests ────────────────────────────────
  describe("View Functions", function () {
    it("Should return correct product data", async function () {
      await contract
        .connect(manufacturer)
        .mintProduct(
          "PROD-VIEW-01", "MFR-0001",
          "testhash", "QmIPFS123"
        );

      const product = await contract.getProduct("PROD-VIEW-01");
      expect(product[0]).to.equal("PROD-VIEW-01"); // productId
      expect(product[1]).to.equal("MFR-0001");     // manufacturerId
      expect(product[3]).to.equal("QmIPFS123");    // ipfsImageHash
    });

    it("Should revert for non-existent product",
      async function () {
        await expect(
          contract.getProduct("PROD-FAKE-999")
        ).to.be.revertedWith("Product not found");
      }
    );

    it("Should return scan count", async function () {
      await contract
        .connect(manufacturer)
        .mintProduct(
          "PROD-SCAN-01", "MFR-0001",
          "hash123", "QmIPFS456"
        );
      await contract
        .connect(distributor)
        .transferCustody("PROD-SCAN-01");
      await contract
        .connect(retailer)
        .receiveAtRetail("PROD-SCAN-01");
      await contract
        .connect(consumer)
        .verifyAndPurchase(
          "PROD-SCAN-01", "hash123",
          "Mumbai", 1900000, 7200000
        );

      const count = await contract.getScanCount("PROD-SCAN-01");
      expect(count).to.equal(1);
    });
  });
});