const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProductRegistryV2", function () {
  let registry;
  let admin;
  let manufacturer;
  let distributor;
  let retailer;
  let other;
  const productId = "V2-PRODUCT-001";

  async function approveRole(account, role, name) {
    await registry.connect(account).requestRole(role, name);
    await registry.connect(admin).approveRole(account.address);
  }

  async function mint() {
    await registry.connect(manufacturer).mintProduct(
      productId,
      "MFR-001",
      "a".repeat(64),
      "",
      distributor.address,
      retailer.address
    );
  }

async function assertLifecycleEvent(tx, { actor, counterparty, previousState, newState, custodian }) {
  const receipt = await (await tx).wait();
  const event = receipt.logs.map((log) => {
    try { return registry.interface.parseLog(log); } catch { return null; }
  }).find((item) => item?.name === "ProductLifecycleEvent");
  expect(event).to.not.equal(undefined);
  expect(event.args.productId.hash).to.equal(ethers.id(productId));
  expect(event.args.actor).to.equal(actor);
  expect(event.args.counterparty).to.equal(counterparty);
  expect(event.args.previousState).to.equal(previousState);
  expect(event.args.newState).to.equal(newState);
  expect(event.args.custodian).to.equal(custodian);
  expect(event.args.timestamp).to.be.greaterThan(0);
}

  beforeEach(async function () {
    [admin, manufacturer, distributor, retailer, other, anotherRetailer] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ProductRegistryV2");
    registry = await Factory.deploy();
    await registry.waitForDeployment();
    await approveRole(manufacturer, 1, "Manufacturer");
    await approveRole(distributor, 2, "Distributor");
    await approveRole(retailer, 3, "Retailer");
  });

  it("requires admin approval for self-requested roles", async function () {
    await expect(registry.connect(other).approveRole(other.address))
      .to.be.revertedWith("Only admin");
    await registry.connect(other).requestRole(2, "Another distributor");
    await expect(registry.connect(other).mintProduct(
      "NO-ROLE", "MFR", "hash", "", distributor.address, retailer.address
    )).to.be.revertedWith("Only manufacturer");
  });

  it("mints to the assigned partners and rejects duplicate IDs", async function () {
    await mint();
    const product = await registry.getProduct(productId);
    expect(product.state).to.equal(0);
    expect(product.manufacturer).to.equal(manufacturer.address);
    expect(product.currentCustodian).to.equal(manufacturer.address);
    expect(product.authorizedDistributor).to.equal(distributor.address);
    expect(product.authorizedRetailer).to.equal(retailer.address);
    await expect(mint()).to.be.revertedWith("Product already minted");
  });

  it("rejects zero, unapproved, or indistinguishable partner addresses", async function () {
    await expect(registry.connect(manufacturer).mintProduct(
      "ZERO", "MFR-001", "hash", "", ethers.ZeroAddress, retailer.address
    )).to.be.revertedWith("Distributor cannot be zero address");
    await expect(registry.connect(manufacturer).mintProduct(
      "WRONG", "MFR-001", "hash", "", other.address, retailer.address
    )).to.be.revertedWith("Invalid distributor address");
    await expect(registry.connect(manufacturer).mintProduct(
      "SAME", "MFR-001", "hash", "", distributor.address, distributor.address
    )).to.be.revertedWith("Partners must be distinct");
  });

  it("requires each assigned actor and every lifecycle step in order", async function () {
    await mint();
    await expect(registry.connect(distributor).receiveByDistributor(productId))
      .to.be.revertedWith("Product not dispatched to distributor");
    await expect(registry.connect(other).dispatchToDistributor(productId))
      .to.be.revertedWith("Only manufacturer");

    const tx = await registry.connect(manufacturer).dispatchToDistributor(productId);
    const receipt = await tx.wait();
    const lifecycleLog = receipt.logs
      .map((log) => {
        try { return registry.interface.parseLog(log); } catch { return null; }
      })
      .find((event) => event?.name === "ProductLifecycleEvent");
    expect(lifecycleLog.args.productId.hash).to.equal(ethers.id(productId));
    expect(lifecycleLog.args.actor).to.equal(manufacturer.address);
    expect(lifecycleLog.args.counterparty).to.equal(distributor.address);
    expect(lifecycleLog.args.previousState).to.equal(0);
    expect(lifecycleLog.args.newState).to.equal(1);
    expect(lifecycleLog.args.custodian).to.equal(manufacturer.address);
    expect(lifecycleLog.args.timestamp).to.be.greaterThan(0);
  });

  it("completes manufacturer dispatch, distributor receipt/dispatch, retailer receipt", async function () {
    await mint();
    await assertLifecycleEvent(registry.connect(manufacturer).dispatchToDistributor(productId), {
      actor: manufacturer.address, counterparty: distributor.address, previousState: 0, newState: 1, custodian: manufacturer.address
    });
    await expect(registry.connect(other).receiveByDistributor(productId))
      .to.be.revertedWith("Only distributor");
    await assertLifecycleEvent(registry.connect(distributor).receiveByDistributor(productId), {
      actor: distributor.address, counterparty: manufacturer.address, previousState: 1, newState: 2, custodian: distributor.address
    });
    let product = await registry.getProduct(productId);
    expect(product.state).to.equal(2);
    expect(product.currentCustodian).to.equal(distributor.address);

    await expect(registry.connect(retailer).dispatchToRetailer(productId))
      .to.be.revertedWith("Only distributor");
    await assertLifecycleEvent(registry.connect(distributor).dispatchToRetailer(productId), {
      actor: distributor.address, counterparty: retailer.address, previousState: 2, newState: 3, custodian: distributor.address
    });
    await assertLifecycleEvent(registry.connect(retailer).receiveByRetailer(productId), {
      actor: retailer.address, counterparty: distributor.address, previousState: 3, newState: 4, custodian: retailer.address
    });
    product = await registry.getProduct(productId);
    expect(product.state).to.equal(4);
    expect(product.currentCustodian).to.equal(retailer.address);
  });

  it("rejects a different wallet with the same on-chain role from receiving assigned custody", async function () {
    await mint();
    await registry.connect(other).requestRole(2, "Wrong distributor");
    await registry.approveRole(other.address);
    await registry.connect(manufacturer).dispatchToDistributor(productId);
    await expect(registry.connect(other).receiveByDistributor(productId))
      .to.be.revertedWith("Not authorized distributor");
    await registry.connect(distributor).receiveByDistributor(productId);
    await registry.connect(distributor).dispatchToRetailer(productId);
    await registry.connect(anotherRetailer).requestRole(3, "Wrong retailer");
    await registry.approveRole(anotherRetailer.address);
    await expect(registry.connect(anotherRetailer).receiveByRetailer(productId))
      .to.be.revertedWith("Not authorized retailer");
  });

  it("permits only the assigned retailer to record sale after receipt", async function () {
    await mint();
    await expect(registry.connect(retailer).recordSale(productId))
      .to.be.revertedWith("Retailer is not current custodian");
    await registry.connect(manufacturer).dispatchToDistributor(productId);
    await registry.connect(distributor).receiveByDistributor(productId);
    await registry.connect(distributor).dispatchToRetailer(productId);
    await registry.connect(retailer).receiveByRetailer(productId);
    await expect(registry.connect(other).recordSale(productId))
      .to.be.revertedWith("Only retailer");
    await registry.connect(retailer).recordSale(productId);
    expect(await registry.getProductState(productId)).to.equal(5);
  });

  it("keeps consumer verification read-only and separate from sale", async function () {
    await mint();
    const before = await registry.getProductState(productId);
    const result = await registry.verifyProduct(productId, "a".repeat(64));
    expect(result.genuine).to.equal(true);
    expect(result.flagged).to.equal(false);
    expect(result.currentState).to.equal(before);
    expect(await registry.getProductState(productId)).to.equal(before);
  });

  it("flags only through the admin-authorized path", async function () {
    await mint();
    await expect(registry.connect(other).flagCounterfeit(productId, "review"))
      .to.be.revertedWith("Only admin");
    await registry.connect(admin).flagCounterfeit(productId, "review");
    expect(await registry.isProductFlagged(productId)).to.equal(true);
    const result = await registry.verifyProduct(productId, "a".repeat(64));
    expect(result.genuine).to.equal(false);
    expect(result.flagged).to.equal(true);
  });
});
