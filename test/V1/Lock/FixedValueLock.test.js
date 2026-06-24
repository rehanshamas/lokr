// test/lock-test.js
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

// TODO Re-make the test to LockContract with all the others contracts (DepositManager, UnlockSchedule and SplitManager)
// TODO Add more comments to the external functions inside the contracts

// Proxy
const ProxyInitializerFalse = { 
  initializer: false, 
  kind: 'uups' 
};

// Lock properties
const CanAddBeneficiaries = true;
const CanNotAddBeneficiaries = false;
const CanRemoveBeneficiaries = true;
const CanNotRemoveBeneficiaries = true;
const CanTransfer = true;
const CanNotTransfer = false;

//  Split properties
const NoRestrictionToSplit = convertToBN(0);
const FullRestrictionToSplit = convertToBN(1);

describe("Lock functional tests", () => {
  before(async () => {
    [governance, account2, account3, account4, account5, account6, account7, upgradeRolSigner] = await ethers.getSigners();
    // Token is using 18 decimals by default
    const TokenFactory = await ethers.getContractFactory('PolkalokrTestToken');
    token = await upgrades.deployProxy(TokenFactory, [1000000000], { kind: 'uups' });
    await token.transfer(account2.address, 10000000);
    await token.transfer(account3.address, 10000000);
    await token.transfer(account4.address, 10000000);
    await token.transfer(account5.address, 10000000);
    await token.transfer(account6.address, 10000000);
  });

  describe("Lock: Can add/remove beneficiaries. Equal Schedule. No restrictions to Split", () => {
    let unlockSchedule, depositManager, splitManager, lock;
    let beneficiaries, initTokenAmounts, totalLockedAmount;
    let lastUnlockDay, unlockCycle, lockStartTime, endLockTime;
    const IDs = [];
    it("Should deploy, init and add beneficiaries on initialization", async () => {
      // Factories and proxys
      const EqualUnlockFactory = await ethers.getContractFactory('EqualUnlockSchedule');
      unlockSchedule = await upgrades.deployProxy(EqualUnlockFactory, ProxyInitializerFalse);

      const DepositManagerFactory = await ethers.getContractFactory('FixedValueDepositManager');
      depositManager = await upgrades.deployProxy(DepositManagerFactory, ProxyInitializerFalse);

      const SplitManagerFactory = await ethers.getContractFactory("SplitManagerTrue");
      splitManager = await upgrades.deployProxy(SplitManagerFactory, ProxyInitializerFalse);

      const LockFactory = await ethers.getContractFactory('FixedValueLock');
      lock = await upgrades.deployProxy(LockFactory, ProxyInitializerFalse);

      //Lock properties 
      const addresses = [governance.address, account2.address, account3.address, account4.address];
      beneficiaries = addresses;
      const amounts = calculateParts([7, 2, 5, 6]);
      initTokenAmounts = amounts;
      const initLockedAmount = convertToBN(7 + 2 + 5 + 6);
      totalLockedAmount = initLockedAmount;

      // Split manager contract arguments as data:
      const splitManagerData =  AbiCoder.encode(["address"], [governance.address]);

      // Deposit manager contract arguments as data:
      const depositManagerData = AbiCoder.encode(["address"], [governance.address]);

      // Lock contract arguments as data:
      // - Beneficiaries data (Lock)
      const beneficiariesData =  AbiCoder.encode(["address[]", "uint[]"], [addresses, amounts]);
      // - Lock Properties data (Lock)
      const lockData =  AbiCoder.encode(
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
       
      await token.approve(lock.address, initLockedAmount);
      await depositManager.initialize(lock.address, depositManagerData);
      await splitManager.initialize(lock.address, splitManagerData);

      
      //Linear Unlock Schedule
      let shmLockStart = (parseInt(await time.latest()) + parseInt(time.duration.days(1))).toString();
      let shmLockLength = time.duration.years(1);
      let shmLockFirstClaimDelay = time.duration.days(30);

      const unlockScheduleData =  AbiCoder.encode(['uint256', 'uint256', 'uint256', 'address'], [shmLockStart, shmLockLength.toString(), shmLockFirstClaimDelay.toString(), governance.address]);

      await unlockSchedule.initialize(lock.address, unlockScheduleData);

      await time.advanceBlock();

      await lock.initialize(lockData, beneficiariesData);
      

      lockStartTime = await lock.lockStartTime();
      endLockTime = await unlockSchedule.lockEnd();



      const eventFilter = await lock.filters.Transfer(zeroAddress); 
      const event = await lock.queryFilter(eventFilter, "latest");
      event.map(async(x, i) => {
        IDs.push(x.args.tokenId);
        const [owner, amount, claimable, startLock, endLock] = await lock.getInfoBySingleID(x.args.tokenId);
        expect(owner).to.be.equal(addresses[i]);
        expect(amount).to.be.equal(amounts[i]);
        expect(claimable).to.be.equal(0);
        expect(startLock).to.be.equal(lockStartTime);
        expect(endLock).to.be.equal(endLockTime);
      });
      expect(await lock.assignedAmount()).to.be.equal(initLockedAmount)
      expect(await token.balanceOf(lock.address)).to.be.equal(initLockedAmount);
    });
    it("Should throw error when other than beneficiaryManager try to add new beneficiaries ", async () => {
      const newBeneficiaries = [account5.address, account6.address];
      const amounts = calculateParts([8, 4]);
      const amountToLock = convertToBN(8 + 4);

      const data =  AbiCoder.encode(["address[]", "uint[]"], [newBeneficiaries, amounts]);
      await expect(lock.connect(account2).addBeneficiaries(data, amountToLock))
        .to.be.revertedWith("ERROR: You are not the Beneficiary Manager");
    });
    it("Should remove beneficiaries", async () => {
      const IDsToRemove = [IDs[2], IDs[3]];
      const data =  AbiCoder.encode(["uint[]"], [IDsToRemove]);
      await lock.removeBeneficiaries(data);
      await time.advanceBlock();
      for(let i = IDsToRemove.length - 1; i >= 0; i--) {
        await expect(lock.getInfoBySingleID(IDsToRemove[i])).to.be.reverted;
        await expect(lock.ownerOf(IDsToRemove[i])).to.be.reverted;
        IDs.splice(IDsToRemove[i], 1);
        initTokenAmounts.splice(IDsToRemove[i], 1);
        beneficiaries.splice(IDsToRemove[i], 1);
      };
    });
    it("Should add new beneficiaries after initialization", async () => {  
        const newBeneficiaries = [account5.address, account6.address];
        Array.prototype.push.apply(beneficiaries, newBeneficiaries);

        const amounts = calculateParts([3, 3]);
        Array.prototype.push.apply(initTokenAmounts, amounts);
        const amountToLock = convertToBN(3 + 3);
  
        const data =  AbiCoder.encode(["address[]", "uint[]"], [newBeneficiaries, amounts]);
        await token.approve(lock.address, amountToLock);
        await lock.addBeneficiaries(data, amountToLock);
  
        const eventFilter = await lock.filters.Transfer(zeroAddress); 
        const event = await lock.queryFilter(eventFilter, "latest");
        event.map(async(x, i) => {
          IDs.push(x.args.tokenId);
          const [owner, amount, claimable, startLock, endLock] = await lock.getInfoBySingleID(x.args.tokenId);
          expect(owner).to.be.equal(newBeneficiaries[i]);
          expect(amount).to.be.equal(amounts[i]);
          expect(claimable).to.be.equal(0);
          // expect(startLock).to.be.equal(lockStartTime); // New beneficiaries should have a new time?
          expect(endLock).to.be.equal(endLockTime);
        });
      });
    it("Should throw error when other than beneficiaryManager try to remove beneficiaries", async () => {
      const IDsToRemove = [0, 1];
      const data =  AbiCoder.encode(["uint[]"], [IDsToRemove]);
      await expect(lock.connect(account2).removeBeneficiaries(data)).to.be.revertedWith("ERROR: You are not the Beneficiary Manager");
    }); 
    it("Should claim correctly amount after 2 days from untouched NFT", async () => {
      const idToClaim = IDs[1];
      const beneficiaryBalanceBeforeClaim = await token.balanceOf(account2.address);
      
      await time.increase(time.duration.days(2));
      const[, , claimable, ,] = await lock.getInfoBySingleID(idToClaim);

      await lock.connect(account2).claimUnlocked(idToClaim, []);
      
      expect(await token.balanceOf(account2.address)).to.be.equal(beneficiaryBalanceBeforeClaim.add(claimable));
    });
    it("Should claim correctly after a claim", async () => {
      const idToClaim = IDs[1];
      const beneficiaryBalanceBeforeClaim = await token.balanceOf(account2.address);;
      const lockBalanceBeforeClaim = await token.balanceOf(lock.address);
      const [,, amountToClaim,] = await lock.getInfoBySingleID(idToClaim);

      await lock.connect(account2).claimUnlocked(idToClaim, []);

      expect(await token.balanceOf(account2.address)).to.be.equal(beneficiaryBalanceBeforeClaim.add(amountToClaim));
    });
    it("Should split correctly in two [50%, 50%]", async () => {
      const idToSplit = IDs[1];
      const parts = calculateParts([0.5, 0.5]);
      const toAddresses = [account4.address, account7.address];
      const [,fullLockedAmount,, startLockOrigin,] = await lock.getInfoBySingleID(idToSplit);
      const contractBalanceBeforeSplit = await token.balanceOf(lock.address);
      let totalLocked = zeroBN;

      await lock.connect(account2).split(idToSplit, parts, toAddresses, []);

      await expect(lock.getInfoBySingleID(idToSplit)).to.be.reverted;
      const indexToRemove = IDs.indexOf(idToSplit);
      IDs.splice(indexToRemove, 1);
      initTokenAmounts.splice(indexToRemove, 1);
      beneficiaries.splice(indexToRemove, 1);

      const eventFilter = await lock.filters.Transfer(zeroAddress); 
      const event = await lock.queryFilter(eventFilter, "latest");
      const newIDs = [];
      event.map(x => newIDs.push(x.args.tokenId));
      for(let i = 0; i < newIDs.length; i++) {
        const [owner, amount, , startLock, endLock] = await lock.getInfoBySingleID(newIDs[i]);
        const [, , initAmount, ] = await depositManager.getProperties(newIDs[i]);
        expect(endLock).to.be.above(startLock);
        IDs.push(newIDs[i]);
        initTokenAmounts.push(initAmount);
        beneficiaries.push(owner);
        totalLocked = totalLocked.add(amount);
        expect(await splitManager.getLockedPart(newIDs[i])).to.be.equal(NoRestrictionToSplit) // Fully splittable
        expect(owner).to.be.equal(toAddresses[i]);
        expect(startLock).to.be.equal(startLockOrigin);
        expect(endLock).to.be.equal(endLockTime);
      }
      expect(totalLocked).to.be.equal(fullLockedAmount)
      expect(await token.balanceOf(lock.address)).to.be.equal(contractBalanceBeforeSplit);
    });
    it("Should claim correct amount after split", async () => {
      const beneficiarySigner = await ethers.getSigner(beneficiaries[4])
      const idToClaim = IDs[4];
      const beneficiaryBalanceBeforeClaim = await token.balanceOf(beneficiarySigner.address);
      const [, , claimable, ,] = await lock.getInfoBySingleID(idToClaim);
      totalLockedAmount = totalLockedAmount.sub(claimable);
      await lock.connect(beneficiarySigner).claimUnlocked(idToClaim, []);
      
      expect(await token.balanceOf(beneficiarySigner.address)).to.be.equal(beneficiaryBalanceBeforeClaim.add(claimable));
    })
    it("Should revert when try to remove beneficiaries after first release", async () => {
      await time.increase(time.duration.days(60));
      const IDsToRemove = [IDs[3], IDs[4]]
      const data =  AbiCoder.encode(["uint[]"], [IDsToRemove]);
      await expect(lock.removeBeneficiaries(data)).to.be.revertedWith("First release reached, cant add/remove new beneficiaries");
      await time.advanceBlock();
    });
    it("Should transfer correctly", async () => {
      const IDToTransfer = IDs[0]
      const toAddress = account4.address;
      const [, oldLockedAmount, , oldStartLock, oldEndLock] = await lock.getInfoBySingleID(IDToTransfer);
      
      await lock.connect(governance).transferFrom(governance.address, toAddress, IDToTransfer);
      
      // The amount claimable will change for the time passed...
      const [newOwner, newLockedAmount, , newStartLock, newEndLock] = await lock.getInfoBySingleID(IDToTransfer);

      expect(newOwner).to.be.equal(toAddress);
      expect(newLockedAmount).to.be.equal(oldLockedAmount);
      expect(newStartLock).to.be.equal(oldStartLock);
      expect(newEndLock).to.be.equal(oldEndLock);
      beneficiaries[0]=toAddress;
    });
    it("Should claim correctly after a transfer", async () => {
      const beneficiarySigner = account4;
      const idToClaim = IDs[0];
      const beneficiaryBalanceBeforeClaim = await token.balanceOf(beneficiarySigner.address);
      const [, , amountToClaim, ] = await lock.getInfoBySingleID(idToClaim);
      await lock.connect(beneficiarySigner).claimUnlocked(idToClaim, []);
      totalLockedAmount = totalLockedAmount.sub(amountToClaim);
      expect(await token.balanceOf(beneficiarySigner.address)).to.be.equal(beneficiaryBalanceBeforeClaim.add(amountToClaim));
      await time.advanceBlock();
    });
    it("Should revert when try to withdraw unassigned amount before lock end", async () => {
      await expect(lock.withdrawAll()).to.be.revertedWith("ERROR: Lock is not ended");
      await time.advanceBlock();
    });
    it("Should revert when try to withdraw unassigned amount without be the manager", async () => {
      await expect(lock.connect(account2).withdrawAll()).to.be.revertedWith("ERROR: You are not the Beneficiary Manager");
      await time.advanceBlock();
    });
    it("Should withdraw unassigned amount", async () => {
      await time.increase(time.duration.days(60));
      const assignedAmount = await lock.assignedAmount();
      const lockedAmount = await lock.totalLockedAmount();
      const unassignedAmount = lockedAmount.sub(assignedAmount);
      const oldestGovernanceBalance = await token.balanceOf(governance.address);
      await time.increase(time.duration.days(260));
      await lock.withdrawAll();
      await time.advanceBlock();
      const newestGovernanceBalance = await token.balanceOf(governance.address);
      expect(newestGovernanceBalance).to.be.equal(oldestGovernanceBalance.add(unassignedAmount));
    });
    it("Should revert when try to withdraw unassigned again", async () => {
      await expect(lock.withdrawAll()).to.be.revertedWith("ERROR: Unassigned amount should be greater than 0");
      await time.advanceBlock();
    });
    it("Should directly upgrade contract only by Governance Role", async () => {
      // Getting new implementation with a different signot, NOT the governace wich is the default. 
      // Note: We only have the same Lock Contract. A new implementation and address with that 
      // contract will be use
      const ImpWithAcc6 = await ethers.getContractFactory('FixedValueLock', account6);
      expect(upgrades.upgradeProxy(lock.address, ImpWithAcc6))
        .to.be.revertedWith("ERROR: Upgrade not authorized");
      const newImplementation = await ethers.getContractFactory('FixedValueLock', governance);
      lock = await upgrades.upgradeProxy(lock.address, newImplementation);  
      await time.advanceBlock();
    });
    it("Should propose a new implementation only from Governance Role", async () => {
      const impProposedFactory = await ethers.getContractFactory('Lock');
      const impProposed = await impProposedFactory.deploy();
      const impAddress = impProposed.address;

      await expect(lock.connect(account4).proposeNewImplementation(impAddress)).to.be.reverted;
      await expect(lock.connect(upgradeRolSigner).proposeNewImplementation(impAddress)).to.be.reverted;
      await lock.connect(governance).proposeNewImplementation(impAddress);
      await time.advanceBlock();
    });
    it("Should upgrade only from proposed implementation and from Upgrader Role", async () => {
      const impProposedFactory = await ethers.getContractFactory('Lock', upgradeRolSigner);
      const impProposed = await impProposedFactory.deploy();
      const impAddress = impProposed.address;
      const impTest = "0xabcabcabcabcabcabcabcabcabcabcabcabcabca";

      await lock.connect(governance).proposeNewImplementation(impAddress);

      // It is not the upgrader rol
      await expect(lock.connect(account4).upgradeTo(impAddress)).to.be.reverted;
      // It is not the proposed address
      await expect(lock.connect(upgradeRolSigner).upgradeTo(impTest)).to.be.reverted;

      await expect(lock.connect(upgradeRolSigner).upgradeTo(impAddress)).to.be.reverted;

      await lock.connect(governance).upgradeTo(impAddress);
      await time.advanceBlock();
    });
    it("Should directly upgrade Deposit Manager contract only by Governance Role", async () => {
      // Getting new implementation with a different signot, NOT the governace wich is the default. 
      // Note: We only have  two DM Contract, and their will work as the same way. Just change how 
      // they initialize their beneficiaries

      // Factory attached with other account
      const ImpWithAcc6 = await ethers.getContractFactory('DepositManagerMT', account6);
      [beneficiary, addedTime, initialAmount, claimedAmount] = await depositManager.getProperties(IDs[0]);

      // Should fail
      await expect(upgrades.upgradeProxy(depositManager.address, ImpWithAcc6))
        .to.be.revertedWith("ERROR: Upgrade not authorized");

      //Factory attached with governace
      const newImplementation = await ethers.getContractFactory('DepositManagerMT', governance);
      depositManager = await upgrades.upgradeProxy(depositManager.address, newImplementation);

      [beneficiaryNew, addedTimeNew, initialAmountNew, claimedAmountNew] = await depositManager.getProperties(IDs[0]);

      expect(beneficiary).to.be.equal(beneficiaryNew);
      expect(addedTime).to.be.equal(addedTimeNew);
      expect(initialAmount).to.be.equal(initialAmountNew);
      expect(claimedAmount).to.be.equal(claimedAmountNew);
      await time.advanceBlock();
    });
    it("Should directly upgrade Split Manager contract only by Governance Role", async () => {
      // Getting new implementation with a different signot, NOT the governace wich is the default. 
      // Note: We only have  two DM Contract, and their will work as the same way. Just change how 
      // they initialize their beneficiaries

      // Factory attached with other account
      const ImpWithAcc6 = await ethers.getContractFactory('SplitManagerFalse', account6);
      const initLockPart = await splitManager.getLockedPart(IDs[0]);

      // Should fail
      await expect(upgrades.upgradeProxy(splitManager.address, ImpWithAcc6)).to.be.revertedWith("ERROR: Upgrade not authorized");

      //Factory attached with governace
      let newImplementation = await ethers.getContractFactory('SplitManagerFalse', governance);
      let newSplitManagerDeploy = await newImplementation.deploy();
      let newSplitManagerAddress = newSplitManagerDeploy.address;
      await splitManager.connect(governance).proposeNewImplementation(newSplitManagerAddress);
      await splitManager.connect(governance).upgradeTo(newSplitManagerAddress);
      expect(await splitManager.getImplementation()).to.equal(newSplitManagerAddress);
    });
  });
});