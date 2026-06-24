// test/TS-001.test.js
const { ethers, upgrades } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const {
  calculateParts,
  convertToBN,
  calcRelativePercent,
  getSMContract,
  makeTree,
  getRemainedAmount
} = require("../utils");
const keccak256 = require('keccak256');
const { expect } = require('chai');
const zeroAddress = ethers.constants.AddressZero;
const zeroBN = ethers.constants.Zero;
const AbiCoder = ethers.utils.defaultAbiCoder;

// Proxy
const ProxyInitializerFalse = {
  initializer: false,
  kind: 'uups'
};

// Lock properties
const CanAddBeneficiaries = true;
const CanRemoveBeneficiaries = true;
const CanTransfer = true;

//  Split properties
const FullRestrictionToSplit = convertToBN(1);

describe("TS-001", () => {
  before(async () => {
    [governance, A, B, C] = await ethers.getSigners();
    // Token is using 18 decimals by default
    const TokenFactory = await ethers.getContractFactory('PolkalokrTestToken');
    token = await upgrades.deployProxy(TokenFactory, [1800], { kind: 'uups' });
    await token.transfer(governance.address, 1800);
  });

  describe("Lock Scenario 001", () => {
    let unlockSchedule, depositManager, splitManager, lock;
    let lockStartTime, endLockTime;
    const IDs = [];
    it("Should deploy, init and add beneficiaries on initialization", async () => {
      // Factories and proxys
      const LinearUnlockFactory = await ethers.getContractFactory('LinearUnlockSchedule');
      unlockSchedule = await upgrades.deployProxy(LinearUnlockFactory, ProxyInitializerFalse);

      const DepositManagerFactory = await ethers.getContractFactory('DepositManager');
      depositManager = await upgrades.deployProxy(DepositManagerFactory, ProxyInitializerFalse);

      const SplitManagerFactory = await ethers.getContractFactory("SplitManagerTrue");
      splitManager = await upgrades.deployProxy(SplitManagerFactory, ProxyInitializerFalse);

      const LockFactory = await ethers.getContractFactory('Lock');
      lock = await upgrades.deployProxy(LockFactory, ProxyInitializerFalse);

      //Lock properties 
      const addresses = [A.address, B.address, C.address];
      const amounts = calculateParts([400, 600, 800]);
      const initLockedAmount = convertToBN(400 + 600 + 800);

      await token.approve(lock.address, initLockedAmount);

      // Lock contract arguments as data:
      // - Beneficiaries data (Lock)
      const beneficiariesData = AbiCoder.encode(["address[]", "uint[]"], [addresses, amounts]);
      // - Lock Properties data (Lock)
      const lockData = AbiCoder.encode(
        [
          "address",
          "address",
          "address",
          "address",
          "address",
          "bool",
          "bool",
          "bool",
          "uint256"
        ],
        [
          unlockSchedule.address,
          depositManager.address,
          splitManager.address,
          token.address,
          governance.address,
          CanAddBeneficiaries,
          CanRemoveBeneficiaries,
          CanTransfer,
          initLockedAmount
        ]
      );

      // Split manager contract arguments as data:
      const splitManagerData = AbiCoder.encode(["uint256", "address"], [FullRestrictionToSplit, governance.address]);

      // Deposit manager contract arguments as data:
      const depositManagerData = AbiCoder.encode(["address"], [governance.address]);


      //Linear Unlock Schedule
      let shmLockStart = await time.latest();
      let shmLockLength = parseInt(shmLockStart) + parseInt(time.duration.days(60));
      let shmLockCliff = parseInt(shmLockStart) + parseInt(time.duration.days(15));

      const unlockScheduleData = AbiCoder.encode(['uint256', 'uint256', 'uint256', 'address'], [shmLockStart.toString(), shmLockLength.toString(), shmLockCliff.toString(), governance.address]);

      await depositManager.initialize(lock.address, depositManagerData);

      await splitManager.initialize(lock.address, splitManagerData);

      await unlockSchedule.initialize(lock.address, unlockScheduleData);

      await time.advanceBlock();

      await lock.initialize(lockData, beneficiariesData);


      lockStartTime = await lock.lockStartTime();
      endLockTime = await unlockSchedule.lockEnd();



      const eventFilter = await lock.filters.Transfer(zeroAddress);
      const event = await lock.queryFilter(eventFilter, "latest");
      event.map(async (x, i) => {
        IDs.push(x.args.tokenId);
        const [owner, amount, claimable, startLock, endLock] = await lock.getInfoBySingleID(x.args.tokenId);
        expect(owner).to.be.equal(addresses[i]);
        expect(amount).to.be.equal(amounts[i]);
        expect(claimable).to.be.equal(0);
        expect(startLock).to.be.equal(lockStartTime);
        expect(endLock).to.be.equal(endLockTime);
      });
    });
    it("Should Verify that 1800 TKN transfered from User to Newly-deploy lock", async () => {
      expect(await token.balanceOf(lock.address)).to.be.equal(convertToBN(1800));
    });
    it("Should Claim after 15 days 1/4", async () => {
      await time.increase(time.duration.days(15));
      let holders = [A, B, C];
      let claimableAmounts = calculateParts([100, 150, 200]);
      for (let i = 0; i < holders.length; i++) {
        const [, , claimable, ,] = await lock.getInfoBySingleID(i);
        expect(claimable).to.be.closeTo(claimableAmounts[i], convertToBN(0.01));
        await lock.connect(holders[i]).claimUnlocked(i);
      }
    });
    it("Should Claim after other 15 days 2/4", async () => {
      await time.increase(time.duration.days(15));
      let holders = [A, B, C];
      let claimableAmounts = calculateParts([100, 150, 200]);
      for (let i = 0; i < holders.length; i++) {
        const [, , claimable, ,] = await lock.getInfoBySingleID(i);
        expect(claimable).to.be.closeTo(claimableAmounts[i], convertToBN(0.01));
        await lock.connect(holders[i]).claimUnlocked(i);
      }
    });
    it("Should Claim after other 15 days 3/4", async () => {
      await time.increase(time.duration.days(15));
      let holders = [A, B, C];
      let claimableAmounts = calculateParts([100, 150, 200]);
      for (let i = 0; i < holders.length; i++) {
        const [, , claimable, ,] = await lock.getInfoBySingleID(i);
        expect(claimable).to.be.closeTo(claimableAmounts[i], convertToBN(0.01));
        await lock.connect(holders[i]).claimUnlocked(i);
      }
    });
    it("Should Claim after last 15 days 4/4", async () => {
      await time.increase(time.duration.days(15));
      let holders = [A, B, C];
      let claimableAmounts = calculateParts([100, 150, 200]);
      for (let i = 0; i < holders.length; i++) {
        const [, , claimable, ,] = await lock.getInfoBySingleID(i);
        expect(claimable).to.be.closeTo(claimableAmounts[i], convertToBN(0.01));
        await lock.connect(holders[i]).claimUnlocked(i);
      }
    });
    it("Should not have tokens remain", async () => {
      await time.increase(time.duration.days(1));
      let holders = [A, B, C];
      for (let i = 0; i < holders.length; i++) {
        const [, , claimable, ,] = await lock.getInfoBySingleID(i);
        expect(claimable).to.equal(0);;
      }
    });
  });
});