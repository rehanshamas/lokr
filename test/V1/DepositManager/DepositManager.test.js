const { ethers, upgrades } = require('hardhat');
const { expect } = require("chai");
const { time } = require('@openzeppelin/test-helpers');
const {calculateParts, convertToBN, makeTree} = require("../utils");
const AbiCoder = ethers.utils.defaultAbiCoder;

const keccak256 = require('keccak256')
const zeroAddress = ethers.constants.AddressZero;

let proxyDM, proxyLockMock, proxySchedule;
before( async () => {
  [account1, account2, account3, account4, account5, account6] = await ethers.getSigners();
});

describe('Deposit Manager - Transactions with benefiacaries/deposits', () => {
  it('Should deploy and init the contract witout errors', async () => {
    const LockMock = await ethers.getContractFactory('LockMock');
    const DepositManager = await ethers.getContractFactory('DepositManager');
    const EqualUnlock = await ethers.getContractFactory('EqualUnlockSchedule');

    proxySchedule = await upgrades.deployProxy(EqualUnlock, { initializer: false, kind: 'uups' });
    proxyLockMock = await upgrades.deployProxy(LockMock, { initializer: false, kind: 'uups' });
    proxyDM = await upgrades.deployProxy(DepositManager, { initializer: false, kind: 'uups' });

    const addresses = [account1.address, account2.address, account3.address];
    const amounts = calculateParts([8, 2, 5]);
    const total = convertToBN(8 + 2 + 5);
    const lockStart = (await time.latest()).toString();
    const lockLenght = (parseInt(await time.latest()) + parseInt(time.duration.days(10))).toString();
    const unlockPeriod = (time.duration.days(1)).toString();

    const USData = AbiCoder.encode(["uint256", "uint256", "uint256", "address"], [lockStart, lockLenght, unlockPeriod, account1.address]);
    const DMdata =  AbiCoder.encode(["address"], [account1.address]);
    const data =  AbiCoder.encode(["address[]", "uint[]"], [addresses, amounts]);

    await proxySchedule.initialize(proxyLockMock.address, USData);
    await proxyDM.initialize(proxyLockMock.address, DMdata);
    await proxyLockMock.initialize(proxyDM.address, proxySchedule.address, data, total);

    const addedTime = (await time.latest()).toString();

    // From zero address because it's a NFT mint
    const eventFilter = await proxyLockMock.filters.Transfer(zeroAddress); 
    const event = await proxyLockMock.queryFilter(eventFilter, "latest");
    const IDs = [];
    event.map(x => IDs.push(x.args.tokenId));
    for(let i=0; i < IDs.length; i++) {
      const [addr, addTimestamp, amount, claimed] = await proxyDM.getProperties(IDs[i]);
      const owner = await proxyLockMock.ownerOf(IDs[i]);
      expect(owner).to.be.equal(addresses[i]);
      expect(addr).to.be.equal(addresses[i]);
      expect(addTimestamp).to.be.equal(addedTime);
      expect(amount).to.be.equal(amounts[i]);
      expect(claimed).to.be.equal(0);
    }
  });
  it('Should add one beneficiary/deposit', async () => {
    const addresses = [account2.address];
    const amounts = calculateParts([5]);
    const total = convertToBN(5);
    const data =  AbiCoder.encode(["address[]", "uint[]"], [addresses, amounts]);

    await proxyLockMock.addBeneficiaries(data, total);
    const addTime = (await time.latest()).toString();

    const eventFilter = await proxyLockMock.filters.Transfer(zeroAddress); 
    const event = await proxyLockMock.queryFilter(eventFilter, "latest");
    const ID = event[0].args.tokenId;
    const [addr, addTimestamp, initialAmount, claimedAmount] = await proxyDM.getProperties(ID);
    const owner = await proxyLockMock.ownerOf(ID);

    expect(owner).to.be.equal(addresses[0]);
    expect(addr).to.be.equal(addresses[0]);
    expect(addTimestamp).to.be.equal(addTime);
    expect(initialAmount).to.be.equal(amounts[0]);
    expect(claimedAmount).to.be.equal(0);
  });
  it('Should add five beneficiaries/deposit', async () => {
    const addresses = [account2.address, account3.address, account4.address, account5.address, account6.address]; 
    const amounts  = calculateParts([3, 5, 2, 2, 17]);
    const total = convertToBN(3 + 5 + 2 + 2 + 17);
    const data =  AbiCoder.encode(["address[]", "uint[]"], [addresses, amounts]);
    
    await proxyLockMock.addBeneficiaries(data, total);

    const addedTime = (await time.latest()).toString();

    const eventFilter = await proxyLockMock.filters.Transfer(zeroAddress); 
    const event = await proxyLockMock.queryFilter(eventFilter, "latest");
    const IDs = [];
    event.map(x => IDs.push(x.args.tokenId));

    for(let i=0; i < IDs.length; i++) {
      const [addr, addTimestamp, amount, claimed] = await proxyDM.getProperties(IDs[i]);
      const owner = await proxyLockMock.ownerOf(IDs[i]);
      expect(owner).to.be.equal(addresses[i]);
      expect(addr).to.be.equal(addresses[i]);
      expect(addTimestamp).to.be.equal(addedTime);
      expect(amount).to.be.equal(amounts[i]);
      expect(claimed).to.be.equal(0);
    }
  });
  it('Should throw an error if call addDeposit directly', async () => {
        const data =  AbiCoder.encode(["address[]", "uint[]"], [[account1.address], [100]]);
        await expect(proxyDM.addDeposits(data, 100)).to.be.reverted;
  });
  it('Should remove one beneficiary/deposit', async () => {
    const ID = [7];
    const data =  AbiCoder.encode(["uint[]"], [ID]);
    await proxyLockMock.removeBeneficiaries(data);

    await expect(proxyLockMock.ownerOf(7)).to.be.reverted;
  });
  it('Should remove three beneficiaries/deposit', async () => {
    const IDs = [3, 6, 8];
    const data =  AbiCoder.encode(["uint[]"], [IDs]);
    await proxyLockMock.removeBeneficiaries(data);

    for(let i=0; i < IDs.length; i++) {
      await expect(proxyLockMock.ownerOf(IDs[i])).to.be.reverted;
    }
  });
  it('Should throw an error if call removeDeposit directly', async () => {
    await expect(proxyDM.removeDeposits(0)).to.be.reverted;
  });
  it('Should throw an error when deleting a non-existing ID', async () => {
    const data =  AbiCoder.encode(["uint[]"], [[8]]);
    await expect(proxyLockMock.removeBeneficiaries(data)).to.be.revertedWith("ERC721: invalid token ID");
  });
  it('Should update the amounts when claiming', async () => {
    const [, , amountInit, claimedAmount] = await proxyDM.getProperties(1);
    const amountToClaim = amountInit.div(2);
    await proxyLockMock.connect(account2).claimUnlocked(1, amountToClaim, []);

    const [, , , claimedAmountNew] = await proxyDM.getProperties(1);
    expect(claimedAmountNew).to.be.equal(amountToClaim);
  });
  it('Should throw an error when claim with wrong user', async () => {

    await expect(proxyLockMock.connect(account3).claimUnlocked(0, "10000", []))
        .to.be.revertedWith("ERROR: You are not the owner or are approved for this NFT");
    await expect(proxyLockMock.connect(account5).claimUnlocked(4, "5000", []))
        .to.be.revertedWith("ERROR: You are not the owner or are approved for this NFT");
  });
  it('Should throw an error when claiming an amount greater than the amount available.', async () => {
    const [, , amountInit, claimedAmount] = await proxyDM.getProperties(1);
    const amountToClaim = amountInit.sub(claimedAmount).add(1);
    await expect(proxyLockMock.connect(account2).claimUnlocked(1, amountToClaim, []))
        .to.be.revertedWith("ERROR: Not enought balance -  Deposit");
  });
  it('Should split in three correctly [40%, 30%, 30%]', async () => {
    const [, timeOrigin, initialOrigin, claimedOrigin] = await proxyDM.getProperties(0);
    const parts = calculateParts([0.4, 0.3, 0.3]);
    const addresses = [account1.address, account2.address, account3.address];

    await proxyLockMock.connect(account1).split(0, parts, addresses, []);

    let totalInitial = convertToBN(0);
    let totalClaimed = convertToBN(0);
    const eventFilter = await proxyLockMock.filters.Transfer(zeroAddress); 
    const event = await proxyLockMock.queryFilter(eventFilter, "latest");
    const IDs = [];
    event.map(x => IDs.push(x.args.tokenId.toString()));

    await expect(proxyLockMock.ownerOf(0)).to.be.reverted;
    for(let i=0; i < IDs.length; i++) {
      const [addr, addTimestamp, amount, claimed] = await proxyDM.getProperties(IDs[i]);
      const owner = await proxyLockMock.ownerOf(IDs[i]);
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

    await expect(proxyLockMock.connect(account3).split(5, parts1, address1, []))
        .to.be.revertedWith("ERROR: Addresses and amounts does not have same length");
    await expect(proxyLockMock.connect(account3).split(5, parts2, address2, []))
        .to.be.revertedWith("ERROR: Addresses and amounts does not have same length");
  });
  it('Should throw an error when trying to split and is not the owner/beneficiary.', async () => {
    const parts = calculateParts([0.3, 0.7]);
    const addresses = [account5.address, account2.address];
    await expect(proxyLockMock.connect(account3).split(1, parts, addresses, []))
        .to.be.revertedWith("ERROR: You are not the owner or are approved for this NFT");
  });
  it('Should throw an error when trying to split with bad distribution.', async () => {
    const parts1Over = calculateParts([0.4, 0.7]);
    const addresses1 = [account1.address, account4.address];
    const parts2Under = calculateParts([0.2, 0.7]);
    const addresses2 = [account1.address, account4.address];
    await expect(proxyLockMock.connect(account1).split(9, parts1Over, addresses1, []))
        .to.be.revertedWith("ERROR: Check Split failed");
    await expect(proxyLockMock.connect(account1).split(9, parts2Under, addresses2, []))
        .to.be.revertedWith("ERROR: Check Split failed");
  });
  it('Should transfer a NFT', async () => {
    const ownerByLock = await proxyLockMock.connect(account2).ownerOf(1);
    const [ownerByDM, , ,] = await proxyDM.getProperties(1);

    await proxyLockMock.connect(account2)['safeTransferFrom(address,address,uint256)'](account2.address, account3.address, 1);

    const newOwnerByLock = await proxyLockMock.connect(account2).ownerOf(1);
    const [newOwnerByDM, , ,] = await proxyDM.getProperties(1);

    expect(newOwnerByLock).to.be.equal(account3.address);
    expect(newOwnerByDM).to.be.equal(account3.address);
    expect(newOwnerByLock).to.be.equal(newOwnerByDM);
  });
});
describe('Deposit Manager with Merkle Tree - Transactions with benefiacaries/deposits', () => {
  let root, tree;
  it('Should deploy and init the contract witout errors', async () => {
    const LockMock = await ethers.getContractFactory('LockMock');
    const DepositManager = await ethers.getContractFactory('DepositManagerMT');
    const EqualUnlock = await ethers.getContractFactory('EqualUnlockSchedule');

    proxySchedule = await upgrades.deployProxy(EqualUnlock, { initializer: false, kind: 'uups' });
    proxyLockMock = await upgrades.deployProxy(LockMock, { initializer: false, kind: 'uups' });
    proxyDM = await upgrades.deployProxy(DepositManager, { initializer: false, kind: 'uups' });
    
    const addresses = [account1.address, account2.address, account3.address];
    const amounts = calculateParts([8, 2, 5]);
    const total = convertToBN(8 + 2 + 5);
    const DMdata =  AbiCoder.encode(["address"], [account1.address]);
    const data =  AbiCoder.encode(["address[]", "uint[]"], [addresses, amounts]);

    const lockStart = (await time.latest()).toString();
    const lockLenght = (parseInt(await time.latest()) + parseInt(time.duration.days(10))).toString();
    const unlockPeriod = (time.duration.days(1)).toString();
    const USData = AbiCoder.encode(["uint256", "uint256", "uint256", "address"], [lockStart, lockLenght, unlockPeriod, account1.address]);
    
    tree = makeTree(addresses, amounts);
    root = "0x"+tree.getRoot().toString('hex');
    
    await proxySchedule.initialize(proxyLockMock.address, USData);
    await proxyDM.initialize(proxyLockMock.address, DMdata);
    await proxyLockMock.initialize(proxyDM.address, proxySchedule.address, data, total);
    
    // From zero address because it's a NFT mint
    const eventFilter = await proxyLockMock.filters.Transfer(zeroAddress); 
    const event = await proxyLockMock.queryFilter(eventFilter, "latest");

    expect(event.length).to.be.equal(0);
    await expect(proxyLockMock.ownerOf(0)).to.be.reverted;
    expect(root).to.be.equal(await proxyDM.root());
  });
  it('Should add one beneficiary/deposit', async () => {
    const addresses = [account2.address];
    const amounts = calculateParts([5]);
    const total = convertToBN(5);
    const data =  AbiCoder.encode(["address[]", "uint[]"], [addresses, amounts]);

    await proxyLockMock.addBeneficiaries(data, total);

    const addedTime = (await time.latest()).toString();

    // From zero address because it's a NFT mint
    const eventFilter = await proxyLockMock.filters.Transfer(zeroAddress); 
    const event = await proxyLockMock.queryFilter(eventFilter, "latest");
    const IDs = [];
    event.map(x => IDs.push(x.args.tokenId));

    const [addr, addTimestamp, amount, claimed] = await proxyDM.getProperties(IDs[0]);
    const owner = await proxyLockMock.ownerOf(IDs[0]);
    expect(owner).to.be.equal(addresses[0]);
    expect(addr).to.be.equal(addresses[0]);
    expect(addTimestamp).to.be.equal(addedTime);
    expect(amount).to.be.equal(amounts[0]);
    expect(claimed).to.be.equal(0);
  });
  it('Should update the amounts when claiming a NFT not minted yet', async () => {
    const initAmount = convertToBN(5);
    const amountToClaim = convertToBN(4);

    const leaf = keccak256(account3.address + ethers.utils.hexZeroPad(initAmount.toHexString(), 32).slice(2))
    const proof = tree.getHexProof(leaf);
    const data =  AbiCoder.encode(["uint", "bytes32[]"], [initAmount, proof]);
    await proxyLockMock.connect(account3).claimNFT(data);

    // From zero address because it's a NFT mint
    const eventFilter = await proxyLockMock.filters.Transfer(zeroAddress); 
    const event = await proxyLockMock.queryFilter(eventFilter, "latest");
    const IDs = [];
    event.map(x => IDs.push(x.args.tokenId));
    
    const [addr, addTimestamp, initialAmount, claimedAmount] = await proxyDM.getProperties(IDs[0]);
    const owner = await proxyLockMock.ownerOf(IDs[0]);
    expect(owner).to.be.equal(account3.address);
    expect(addr).to.be.equal(account3.address);
    expect(addTimestamp).to.be.equal(await proxyLockMock.lockStartTime());
    expect(initialAmount).to.be.equal(initAmount);
    expect(claimedAmount).to.be.equal(0);  
  });
  it('Should throw an error when claim with wrong user', async () => {
    const [addr, time, initialAmount, claimedAmount] = await proxyDM.getProperties(1);
    const amountToclaim = initialAmount.sub(claimedAmount);
    await expect(proxyLockMock.connect(account2).claimUnlocked(1, amountToclaim, []))
        .to.be.revertedWith("ERROR: You are not the owner or are approved for this NFT");
  });
  it('Should throw an error when claiming an amount greater than the amount available without MerkleTree.', async () => {
    const [, , amountInit, claimedAmount] = await proxyDM.getProperties(1);
    const amountToClaim = amountInit.sub(claimedAmount).add(1);
    await expect(proxyLockMock.connect(account3).claimUnlocked(1, amountToClaim, []))
        .to.be.revertedWith("ERROR: Not enought balance -  Deposit");
  });
  it('Should throw an error when claiming an amount greater than the amount available with MerkleTree.', async () => {
    const initAmount = convertToBN(2);
    const amountToClaim = convertToBN(7);
    const leaf = keccak256(account2.address + ethers.utils.hexZeroPad(initAmount.toHexString(), 32).slice(2));
    const proof = tree.getHexProof(leaf)
    const data =  AbiCoder.encode(["uint", "bytes32[]"], [initAmount, proof]);
    await expect(proxyLockMock.connect(account2).claimUnlocked(0, amountToClaim))
        .to.be.revertedWith("ERROR: Not enought balance -  Deposit");;
  });
  it('Should add five beneficiaries/deposit', async () => {
    const addresses = [account2.address, account3.address, account4.address, account5.address, account6.address]; 
    const amounts  = calculateParts([3, 5, 2, 2, 17]);
    const total = convertToBN(3 + 5 + 2 + 2 + 17);
    const data =  AbiCoder.encode(["address[]", "uint[]"], [addresses, amounts]);
    
    await proxyLockMock.addBeneficiaries(data, total);

    const addedTime = (await time.latest()).toString();

    // From zero address because it's a NFT mint
    const eventFilter = await proxyLockMock.filters.Transfer(zeroAddress); 
    const event = await proxyLockMock.queryFilter(eventFilter, "latest");
    const IDs = [];
    event.map(x => IDs.push(x.args.tokenId));

    for(let i=0; i < IDs.length; i++) {
      const [addr, addTimestamp, amount, claimed] = await proxyDM.getProperties(IDs[i]);
      const owner = await proxyLockMock.ownerOf(IDs[i]);
      expect(owner).to.be.equal(addresses[i]);
      expect(addr).to.be.equal(addresses[i]);
      expect(addTimestamp).to.be.equal(addedTime);
      expect(amount).to.be.equal(amounts[i]);
      expect(claimed).to.be.equal(0);
    }
  });
  it('Should throw an error if call addDeposit directly', async () => {
        const data =  AbiCoder.encode(["address[]", "uint[]"], [[account1.address], [100]]);
        await expect(proxyDM.addDeposits(data, 100)).to.be.reverted;
  });
  it('Should remove one beneficiary/deposit', async () => {
    const data =  AbiCoder.encode(["uint[]"], [[0]]);
    await proxyLockMock.removeBeneficiaries(data);
    await expect(proxyLockMock.ownerOf(0)).to.be.reverted;
  });
  it('Should remove three beneficiaries/deposit', async () => {
    const IDs = [3, 4, 6]
    const data =  AbiCoder.encode(["uint[]"], [IDs]);
    await proxyLockMock.removeBeneficiaries(data);

    for(let i=0; i < IDs.length; i++) {
      await expect(proxyLockMock.ownerOf(IDs[i])).to.be.reverted;
    }
  });
  it('Should throw an error if call removeDeposit directly', async () => {
    await expect(proxyDM.removeDeposits(0)).to.be.reverted;
});
  it('Should throw an error when deleting a non-existing ID', async () => {
    const data1 =  AbiCoder.encode(["uint[]"], [[0]]);
    const data2 =  AbiCoder.encode(["uint[]"], [[8]]);
    await expect(proxyLockMock.removeBeneficiaries(data1)).to.be.revertedWith("ERC721: invalid token ID");
    await expect(proxyLockMock.removeBeneficiaries(data2)).to.be.revertedWith("ERC721: invalid token ID");
  });
  it('Should split in three correctly from NFT already minted [30%, 25%, 45%]', async () => {
    const [, timeOrigin, initialAmountOrigin, claimedAmountOrigin] = await proxyDM.getProperties(1);
    const parts = calculateParts([0.3, 0.25, 0.45]);
    const addresses = [account3.address, account2.address, account4.address];

    // In this case, the ID must be the ID-Number that the user wanna split (because is already minted :P)
    // And data must be empty []
    await proxyLockMock.connect(account3).split(1, parts, addresses, []);

    let totalInitial = convertToBN(0);
    let totalClaimed = convertToBN(0);
    const eventFilter = await proxyLockMock.filters.Transfer(zeroAddress); 
    const event = await proxyLockMock.queryFilter(eventFilter, "latest");
    const IDs = [];
    event.map(x => IDs.push(x.args.tokenId.toString()));

    await expect(proxyLockMock.ownerOf(1)).to.be.reverted;
    for(let i=0; i < IDs.length; i++) {
      const [addr, addTimestamp, amount, claimed] = await proxyDM.getProperties(IDs[i]);
      const owner = await proxyLockMock.ownerOf(IDs[i]);
      totalInitial = totalInitial.add(amount);
      totalClaimed = totalClaimed.add(claimed);

      expect(owner).to.be.equal(addresses[i]);
      expect(addr).to.be.equal(addresses[i]);
      expect(addTimestamp).to.be.equal(timeOrigin);
      expect(amount).to.be.equal(parts[i].mul(initialAmountOrigin).div(convertToBN(1)));
      expect(claimed).to.be.equal(parts[i].mul(claimedAmountOrigin).div(convertToBN(1)));
    }
    expect(totalInitial).to.be.equal(initialAmountOrigin);
    expect(totalClaimed).to.be.equal(claimedAmountOrigin);
  });
  it('Should throw an error when trying to split and there is missing data.', async () => {
    const parts1 = calculateParts([0.3, 0.7]);
    const address1 = [account5.address];
    const parts2 = calculateParts([0.3]);
    const address2 = [account5.address, account1.address];

    await expect(proxyLockMock.connect(account2).split(2, parts1, address1, []))
        .to.be.revertedWith("ERROR: Addresses and amounts does not have same length");
    await expect(proxyLockMock.connect(account2).split(2, parts2, address2, []))
        .to.be.revertedWith("ERROR: Addresses and amounts does not have same length");

  });
  it('Should throw an error when trying to split and is not the owner/beneficiary.', async () => {
    const parts = calculateParts([0.3, 0.7]);
    const addresses = [account5.address, account2.address];
    await expect(proxyLockMock.connect(account3).split(2, parts, addresses, []))
        .to.be.revertedWith("ERROR: You are not the owner or are approved for this NFT");
  });
  it('Should throw an error when trying to split with bad distribution.', async () => {
    const parts1Over = calculateParts([0.4, 0.7]);
    const addresses1 = [account1.address, account4.address];
    const parts2Under = calculateParts([0.2, 0.7]);
    const addresses2 = [account1.address, account4.address];
    await expect(proxyLockMock.connect(account2).split(2, parts1Over, addresses1, []))
        .to.be.revertedWith("ERROR: Check Split failed");
    await expect(proxyLockMock.connect(account2).split(2, parts2Under, addresses2, []))
        .to.be.revertedWith("ERROR: Check Split failed");
  });
  it('Should transfer a NFT', async () => {
    const ownerByLock = await proxyLockMock.connect(account2).ownerOf(2);
    const [ownerByDM, , ,] = await proxyDM.getProperties(2);

    await proxyLockMock.connect(account2)['safeTransferFrom(address,address,uint256)'](account2.address, account3.address, 2);

    const newOwnerByLock = await proxyLockMock.connect(account2).ownerOf(2);
    const [newOwnerByDM, , ,] = await proxyDM.getProperties(2);

    expect(newOwnerByLock).to.be.equal(account3.address);
    expect(newOwnerByDM).to.be.equal(account3.address);
    expect(newOwnerByLock).to.be.equal(newOwnerByDM);
  });
});