const { ethers, upgrades } = require('hardhat');
const { expect } = require("chai");
const { time } = require('@openzeppelin/test-helpers');
const {calculateParts, convertToBN, makeTree} = require("../utils");
const AbiCoder = ethers.utils.defaultAbiCoder;

const keccak256 = require('keccak256')
const zeroAddress = ethers.constants.AddressZero;

let proxyDM, proxyLock, proxySchedule;
before( async () => {
  [account1, account2, account3, account4, account5, account6] = await ethers.getSigners();
});

describe('FixedValueDeposit Manager - Transactions with benefiacaries/deposits', () => {
  it('Should deploy and init the contract witout errors', async () => {
    const FixedValueLock = await ethers.getContractFactory('FixedValueLockMock');
    const FixedValueDepositManager = await ethers.getContractFactory('FixedValueDepositManager');
    const EqualUnlock = await ethers.getContractFactory('EqualUnlockSchedule');

    proxySchedule = await upgrades.deployProxy(EqualUnlock, { initializer: false, kind: 'uups' });
    proxyLock = await upgrades.deployProxy(FixedValueLock, { initializer: false, kind: 'uups' });
    proxyDM = await upgrades.deployProxy(FixedValueDepositManager, { initializer: false, kind: 'uups' });

    const addresses = [account1.address, account2.address, account3.address];
    const amounts = calculateParts([8, 2, 5]);
    const total = convertToBN(8 + 2 + 5);
    const lockStart = (await time.latest()).toString();
    const lockLenght = (parseInt(await time.latest()) + parseInt(time.duration.days(10))).toString();
    const unlockPeriod = (time.duration.days(1)).toString();

    const USData = AbiCoder.encode(["uint256", "uint256", "uint256", "address"], [lockStart, lockLenght, unlockPeriod, account1.address]);
    const DMdata =  AbiCoder.encode(["address"], [account1.address]);
    const data =  AbiCoder.encode(["address[]", "uint[]"], [addresses, amounts]);

    await proxySchedule.initialize(proxyLock.address, USData);
    await proxyDM.initialize(proxyLock.address, DMdata);
    await proxyLock.initialize(proxyDM.address, proxySchedule.address, data, total);

    const addedTime = (await time.latest()).toString();

    // From zero address because it's a NFT mint
    const eventFilter = await proxyLock.filters.Transfer(zeroAddress); 
    const event = await proxyLock.queryFilter(eventFilter, "latest");
    const IDs = [];
    event.map(x => IDs.push(x.args.tokenId));
    for(let i=0; i < IDs.length; i++) {
      const [addr, addTimestamp, amount, claimed] = await proxyDM.getProperties(IDs[i]);
      const owner = await proxyLock.ownerOf(IDs[i]);
      expect(owner).to.be.equal(addresses[i]);
      expect(addr).to.be.equal(addresses[i]);
      expect(addTimestamp).to.be.equal(addedTime);
      expect(amount).to.be.equal(amounts[i]);
      expect(claimed).to.be.equal(0);
    }
  });
  it('Should remove one beneficiary/deposit', async () => {
    const ID = [2];
    const data =  AbiCoder.encode(["uint[]"], [ID]);
    await proxyLock.removeBeneficiaries(data);

    await expect(proxyLock.ownerOf(2)).to.be.reverted;
  });
  it('Should add one beneficiary/deposit', async () => {
    const addresses = [account2.address];
    const amounts = calculateParts([5]);
    const total = convertToBN(5);
    const data =  AbiCoder.encode(["address[]", "uint[]"], [addresses, amounts]);

    await proxyLock.addBeneficiaries(data, total);
    const addTime = (await time.latest()).toString();

    const eventFilter = await proxyLock.filters.Transfer(zeroAddress); 
    const event = await proxyLock.queryFilter(eventFilter, "latest");
    const ID = event[0].args.tokenId;
    const [addr, addTimestamp, initialAmount, claimedAmount] = await proxyDM.getProperties(ID);
    const owner = await proxyLock.ownerOf(ID);

    expect(owner).to.be.equal(addresses[0]);
    expect(addr).to.be.equal(addresses[0]);
    expect(addTimestamp).to.be.equal(addTime);
    expect(initialAmount).to.be.equal(amounts[0]);
    expect(claimedAmount).to.be.equal(0);
    console.log(await proxyLock.assignedAmount());
  });
  it('Should throw an error if call addDeposit directly', async () => {
    const data =  AbiCoder.encode(["address[]", "uint[]"], [[account1.address], [100]]);
    await expect(proxyDM.addDeposits(data, 100)).to.be.reverted;
  });
  it('Should remove three beneficiaries/deposit', async () => {
    const IDs = [0, 1, 3];
    const data =  AbiCoder.encode(["uint[]"], [IDs]);
    await proxyLock.removeBeneficiaries(data);

    for(let i=0; i < IDs.length; i++) {
      await expect(proxyLock.ownerOf(IDs[i])).to.be.reverted;
    }
  });
  it('Should add five beneficiaries/deposit', async () => {
    const addresses = [account2.address, account3.address, account4.address, account5.address, account6.address]; 
    const amounts  = calculateParts([3, 5, 2, 2, 3]);
    const total = convertToBN(3 + 5 + 2 + 2 + 3);
    const data =  AbiCoder.encode(["address[]", "uint[]"], [addresses, amounts]);
    console.log(await proxyLock.assignedAmount());
    await proxyLock.addBeneficiaries(data, total);

    const addedTime = (await time.latest()).toString();

    const eventFilter = await proxyLock.filters.Transfer(zeroAddress); 
    const event = await proxyLock.queryFilter(eventFilter, "latest");
    const IDs = [];
    event.map(x => IDs.push(x.args.tokenId));

    for(let i=0; i < IDs.length; i++) {
      const [addr, addTimestamp, amount, claimed] = await proxyDM.getProperties(IDs[i]);
      const owner = await proxyLock.ownerOf(IDs[i]);
      expect(owner).to.be.equal(addresses[i]);
      expect(addr).to.be.equal(addresses[i]);
      expect(addTimestamp).to.be.equal(addedTime);
      expect(amount).to.be.equal(amounts[i]);
      expect(claimed).to.be.equal(0);
    }
  });
  it('Should throw an error if call removeDeposit directly', async () => {
    await expect(proxyDM.removeDeposits(0)).to.be.reverted;
  });
  it('Should throw an error when deleting a non-existing ID', async () => {
    const data =  AbiCoder.encode(["uint[]"], [[9]]);
    await expect(proxyLock.removeBeneficiaries(data)).to.be.revertedWith("ERC721: invalid token ID");
  });
  it('Should update the amounts when claiming', async () => {
    const [, , amountInit,] = await proxyDM.getProperties(8);
    const amountToClaim = amountInit.div(2);
    await proxyLock.connect(account6).claimUnlocked(8, amountToClaim);

    const [, , , claimedAmountNew] = await proxyDM.getProperties(8);
    expect(claimedAmountNew).to.be.equal(amountToClaim);
  });
  it('Should throw an error when claim with wrong user', async () => {

    await expect(proxyLock.connect(account3).claimUnlocked(8, "10000", []))
        .to.be.revertedWith("ERROR: You are not the owner or are approved for this NFT");
    await expect(proxyLock.connect(account5).claimUnlocked(4, "5000", []))
        .to.be.revertedWith("ERROR: You are not the owner or are approved for this NFT");
  });
  it('Should throw an error when claiming an amount greater than the amount available.', async () => {
    const [, , amountInit, claimedAmount] = await proxyDM.getProperties(8);
    const amountToClaim = amountInit.sub(claimedAmount).add(1);
    await expect(proxyLock.connect(account6).claimUnlocked(8, amountToClaim))
        .to.be.revertedWith("ERROR: Not enought balance -  Deposit");
  });
  it('Should split in three correctly [40%, 30%, 30%]', async () => {
    const [, timeOrigin, initialOrigin, claimedOrigin] = await proxyDM.getProperties(7);
    const parts = calculateParts([0.4, 0.3, 0.3]);
    const addresses = [account1.address, account2.address, account3.address];

    await proxyLock.connect(account5).split(7, parts, addresses, []);

    let totalInitial = convertToBN(0);
    let totalClaimed = convertToBN(0);
    const eventFilter = await proxyLock.filters.Transfer(zeroAddress); 
    const event = await proxyLock.queryFilter(eventFilter, "latest");
    const IDs = [];
    event.map(x => IDs.push(x.args.tokenId.toString()));

    await expect(proxyLock.ownerOf(7)).to.be.reverted;
    for(let i=0; i < IDs.length; i++) {
      const [addr, addTimestamp, amount, claimed] = await proxyDM.getProperties(IDs[i]);
      const owner = await proxyLock.ownerOf(IDs[i]);
      totalInitial = totalInitial.add(amount);
      totalClaimed = totalClaimed.add(claimed);

      expect(owner).to.be.equal(addresses[i]);
      expect(addr).to.be.equal(addresses[i]);
      expect(addTimestamp).to.be.equal(timeOrigin);
      expect(amount).to.be.equal(parts[i].mul(initialOrigin).div(convertToBN(1)));
      expect(claimed).to.be.equal(parts[i].mul(claimedOrigin).div(convertToBN(1)));
    }
    expect(totalInitial).to.be.equal(initialOrigin);
    expect(totalClaimed).to.be.equal(claimedOrigin);
  });
  it('Should throw an error when trying to split and there is missing data.', async () => {
    const parts1 = calculateParts([0.3, 0.7]);
    const address1 = [account5.address];
    const parts2 = calculateParts([0.3]);
    const address2 = [account5.address, account1.address];

    await expect(proxyLock.connect(account3).split(5, parts1, address1, []))
        .to.be.revertedWith("ERROR: Addresses and amounts does not have same length");
    await expect(proxyLock.connect(account3).split(5, parts2, address2, []))
        .to.be.revertedWith("ERROR: Addresses and amounts does not have same length");
  });
  it('Should throw an error when trying to split and is not the owner/beneficiary.', async () => {
    const parts = calculateParts([0.3, 0.7]);
    const addresses = [account5.address, account2.address];
    await expect(proxyLock.connect(account4).split(5, parts, addresses, []))
        .to.be.revertedWith("ERROR: You are not the owner or are approved for this NFT");
  });
  it('Should throw an error when trying to split with bad distribution.', async () => {
    const parts1Over = calculateParts([0.4, 0.7]);
    const addresses1 = [account1.address, account4.address];
    const parts2Under = calculateParts([0.2, 0.7]);
    const addresses2 = [account1.address, account4.address];
    await expect(proxyLock.connect(account1).split(9, parts1Over, addresses1, []))
        .to.be.revertedWith("ERROR: Check Split failed");
    await expect(proxyLock.connect(account1).split(9, parts2Under, addresses2, []))
        .to.be.revertedWith("ERROR: Check Split failed");
  });
  it('Should transfer a NFT', async () => {
    const ownerByLock = await proxyLock.connect(account3).ownerOf(5);
    const [ownerByDM, , ,] = await proxyDM.getProperties(5);

    await proxyLock.connect(account3)['safeTransferFrom(address,address,uint256)'](account3.address, account2.address, 5);

    const newOwnerByLock = await proxyLock.connect(account3).ownerOf(5);
    const [newOwnerByDM, , ,] = await proxyDM.getProperties(5);

    expect(newOwnerByLock).to.be.equal(account2.address);
    expect(newOwnerByDM).to.be.equal(account2.address);
    expect(newOwnerByLock).to.be.equal(newOwnerByDM);
  });
  /*
  */
});