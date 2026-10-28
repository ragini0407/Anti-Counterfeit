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

  // ── Role Management Tests ──────────────────────────────
  describe("Role Management", function () {

    it("Should set deployer as admin", async function () {
      expect(await contract.admin()).to.equal(admin.address);
    });

    it("Should approve manufacturer role", async function () {
      expect(await contract.getRole(manufacturer.address))
        .to.equal(1);
    });

    it("Should approve distributor role", async function () {
      expect(await contract.getRole(distributor.address))
        .to.equal(2);
    });

    it("Should approve retailer role", async function () {
      expect(await contract.getRole(retailer.address))
        .to.equal(3);
    });

    it("Should revoke a role", async function () {
      await contract.revokeRole(manufacturer.address);
      expect(await contract.getRole(manufacturer.address))
        .to.equal(0);
    });

    it("Should reject role request from non-admin",
      async function () {
        await expect(
          contract
            .connect(consumer)
            .approveRole(consumer.address)
        ).to.be.revertedWith("Only admin");
      }
    );

    it("Should reject duplicate role request",
      async function () {
        await expect(
          contract
            .connect(manufacturer)
            .requestRole(1, "Another Company")
        ).to.be.revertedWith("Already has a role");
      }
    );
  });

  // ── Product Lifecycle Tests ────────────────────────────
  describe("Product Lifecycle", function () {
    const productId = "PROD-2026-TEST01";
    const mfrId     = "MFR-0001";
    const hash      = "abc123hash456";
    const ipfsHash  = "QmTest123";

    beforeEach(async function () {
      // Mint product with authorized distributor and retailer
      await contract
        .connect(manufacturer)
        .mintProduct(
          productId,
          mfrId,
          hash,
          ipfsHash,
          distributor.address,
          retailer.address
        );
    });

    // ── Minting ──────────────────────────────────────────
    it("Should mint product in MINTED state",
      async function () {
        const state = await contract.getProductState(productId);
        expect(state).to.equal(0); // MINTED
      }
    );

    it("Should reject duplicate product ID",
      async function () {
        await expect(
          contract
            .connect(manufacturer)
            .mintProduct(
              productId, mfrId, hash, ipfsHash,
              distributor.address, retailer.address
            )
        ).to.be.revertedWith("Product already minted");
      }
    );

    it("Should reject mint from non-manufacturer",
      async function () {
        await expect(
          contract
            .connect(consumer)
            .mintProduct(
              "PROD-999", mfrId, hash, ipfsHash,
              distributor.address, retailer.address
            )
        ).to.be.revertedWith("Only manufacturer");
      }
    );

    it("Should reject mint with invalid distributor",
      async function () {
        await expect(
          contract
            .connect(manufacturer)
            .mintProduct(
              "PROD-NEW-001", mfrId, hash, ipfsHash,
              consumer.address,  // consumer is not a distributor
              retailer.address
            )
        ).to.be.revertedWith("Invalid distributor address");
      }
    );

    it("Should reject mint with invalid retailer",
      async function () {
        await expect(
          contract
            .connect(manufacturer)
            .mintProduct(
              "PROD-NEW-002", mfrId, hash, ipfsHash,
              distributor.address,
              consumer.address  // consumer is not a retailer
            )
        ).to.be.revertedWith("Invalid retailer address");
      }
    );

    // ── Distributor ───────────────────────────────────────
    it("Authorized distributor should update to IN_TRANSIT",
      async function () {
        await contract
          .connect(distributor)
          .transferCustody(productId);
        const state = await contract.getProductState(productId);
        expect(state).to.equal(1); // IN_TRANSIT
      }
    );

    it("Should reject transferCustody from non-distributor",
      async function () {
        await expect(
          contract
            .connect(consumer)
            .transferCustody(productId)
        ).to.be.revertedWith("Only distributor");
      }
    );

    it("Should reject transferCustody from wrong distributor",
      async function () {
        // Create another distributor
        const [,,,,,, anotherDistributor] =
          await ethers.getSigners();
        await contract
          .connect(anotherDistributor)
          .requestRole(2, "Another Logistics");
        await contract.approveRole(anotherDistributor.address);

        // Wrong distributor tries to take custody
        await expect(
          contract
            .connect(anotherDistributor)
            .transferCustody(productId)
        ).to.be.revertedWith(
          "Not authorized distributor for this product"
        );
      }
    );

    // ── Retailer ──────────────────────────────────────────
    it("Authorized retailer should mark RECEIVED_BY_RETAILER",
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
          contract
            .connect(consumer)
            .receiveAtRetail(productId)
        ).to.be.revertedWith("Only retailer");
      }
    );

    it("Should reject receiveAtRetail from wrong retailer",
      async function () {
        await contract
          .connect(distributor)
          .transferCustody(productId);

        // Create another retailer
        const [,,,,,,, anotherRetailer] =
          await ethers.getSigners();
        await contract
          .connect(anotherRetailer)
          .requestRole(3, "Another Store");
        await contract.approveRole(anotherRetailer.address);

        // Wrong retailer tries to receive
        await expect(
          contract
            .connect(anotherRetailer)
            .receiveAtRetail(productId)
        ).to.be.revertedWith(
          "Not authorized retailer for this product"
        );
      }
    );

    // ── Consumer Verification ─────────────────────────────
    it("Backend verifyProduct should mark SOLD",
      async function () {
        await contract
          .connect(distributor)
          .transferCustody(productId);
        await contract
          .connect(retailer)
          .receiveAtRetail(productId);

        const result = await contract
          .verifyProduct.staticCall(productId, hash);

        expect(result[0]).to.equal(true);  // genuine
        expect(result[1]).to.equal(false); // not already sold
        expect(result[2]).to.equal(false); // not flagged
        expect(result[3]).to.equal(3);     // state = SOLD
      }
    );

    it("Should return alreadySold on second scan",
      async function () {
        await contract
          .connect(distributor)
          .transferCustody(productId);
        await contract
          .connect(retailer)
          .receiveAtRetail(productId);

        // First scan - marks SOLD
        await contract.verifyProduct(productId, hash);

        // Second scan - already sold
        const result = await contract
          .verifyProduct.staticCall(productId, hash);

        expect(result[1]).to.equal(true); // alreadySold
      }
    );

    // ── Fix #4 - Hash Mismatch → FLAGGED ─────────────────
    it("Hash mismatch should flag product as counterfeit",
      async function () {
        await contract
          .connect(distributor)
          .transferCustody(productId);
        await contract
          .connect(retailer)
          .receiveAtRetail(productId);

        // Verify with WRONG hash
        const result = await contract
          .verifyProduct.staticCall(productId, "wronghash999");

        expect(result[0]).to.equal(false); // not genuine
        expect(result[2]).to.equal(true);  // flagged
        expect(result[3]).to.equal(4);     // FLAGGED_COUNTERFEIT
      }
    );

    it("Hash mismatch should change state to FLAGGED_COUNTERFEIT",
      async function () {
        await contract
          .connect(distributor)
          .transferCustody(productId);
        await contract
          .connect(retailer)
          .receiveAtRetail(productId);

        // Verify with wrong hash
        await contract.verifyProduct(productId, "wronghash999");

        // Check state changed
        const state = await contract.getProductState(productId);
        expect(state).to.equal(4); // FLAGGED_COUNTERFEIT
      }
    );

    // ── Fix #11 - Counterfeit Flagging ────────────────────
    it("Admin should flag product as counterfeit",
      async function () {
        await contract.flagCounterfeit(productId, "Fake detected");
        const state = await contract.getProductState(productId);
        expect(state).to.equal(4); // FLAGGED_COUNTERFEIT
      }
    );

    it("Should reject flagging from non-admin",
      async function () {
        await expect(
          contract
            .connect(consumer)
            .flagCounterfeit(productId, "test")
        ).to.be.revertedWith("Only admin");
      }
    );

    it("Should reject double flagging",
      async function () {
        await contract.flagCounterfeit(productId, "Fake");
        await expect(
          contract.flagCounterfeit(productId, "Fake again")
        ).to.be.revertedWith("Already flagged");
      }
    );

    it("Flagged product should remain flagged on rescan",
      async function () {
        await contract.flagCounterfeit(productId, "Fake");

        // Try to verify flagged product
        const result = await contract
          .verifyProduct.staticCall(productId, hash);

        expect(result[2]).to.equal(true); // still flagged
        expect(result[3]).to.equal(4);    // still FLAGGED
      }
    );
  });

  // ── View Function Tests ────────────────────────────────
  describe("View Functions", function () {

    it("Should return correct product data",
      async function () {
        await contract
          .connect(manufacturer)
          .mintProduct(
            "PROD-VIEW-01", "MFR-0001",
            "testhash", "QmIPFS123",
            distributor.address,
            retailer.address
          );

        const product = await contract.getProduct("PROD-VIEW-01");
        expect(product[0]).to.equal("PROD-VIEW-01"); // productId
        expect(product[1]).to.equal("MFR-0001");     // mfrId
        expect(product[2]).to.equal("testhash");     // hash
        expect(product[3]).to.equal("QmIPFS123");    // ipfsHash
        expect(product[5]).to.equal(0);              // MINTED
        expect(product[7]).to.equal(                 // distributor
          distributor.address
        );
        expect(product[8]).to.equal(                 // retailer
          retailer.address
        );
      }
    );

    it("Should revert for non-existent product",
      async function () {
        await expect(
          contract.getProduct("PROD-FAKE-999")
        ).to.be.revertedWith("Product not found");
      }
    );

    it("Should return correct scan count",
      async function () {
        await contract
          .connect(manufacturer)
          .mintProduct(
            "PROD-SCAN-01", "MFR-0001",
            "hash123", "QmIPFS456",
            distributor.address,
            retailer.address
          );
        await contract
          .connect(distributor)
          .transferCustody("PROD-SCAN-01");
        await contract
          .connect(retailer)
          .receiveAtRetail("PROD-SCAN-01");

        // Two scans
        await contract.verifyProduct("PROD-SCAN-01", "hash123");
        await contract.verifyProduct("PROD-SCAN-01", "hash123");

        const count = await contract.getScanCount("PROD-SCAN-01");
        expect(count).to.equal(2);
      }
    );

    it("Should return true for flagged product",
      async function () {
        await contract
          .connect(manufacturer)
          .mintProduct(
            "PROD-FLAG-01", "MFR-0001",
            "hash456", "QmIPFS789",
            distributor.address,
            retailer.address
          );
        await contract.flagCounterfeit(
          "PROD-FLAG-01", "Fake detected"
        );
        const flagged = await contract.isProductFlagged(
          "PROD-FLAG-01"
        );
        expect(flagged).to.equal(true);
      }
    );
  });
});