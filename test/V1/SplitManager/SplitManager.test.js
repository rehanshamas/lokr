const { ethers, upgrades } = require('hardhat');
const { expect, assert } = require("chai");
const { time } = require('@openzeppelin/test-helpers');
const {calculateParts, convertToBN, calcRelativePercent, getSMContract} = require("../utils");

const AbiCoder = ethers.utils.defaultAbiCoder;
let proxySM;
before( async () => {
  [account1, account2, account3, account4, account5, account6, mockLockSigner] = await ethers.getSigners();
});
describe('Split Manager - Percentage Rule - Splits/Transactions', () => {
    const lockedPartInitial = convertToBN(0.8);
    before( async () => {
        // Use the signer address as caller for functions
        const SplitManager = await getSMContract(lockedPartInitial);
        const mockLockAddress = mockLockSigner.address;
        const data =  AbiCoder.encode(["uint256", "address"], [lockedPartInitial, account1.address]);
        proxySM = await upgrades.deployProxy(SplitManager, [mockLockAddress, data], { kind: 'uups' });
    });
    it('Should get the initial locked part if no ID is provided.', async () => {
        expect(await proxySM.initialLockedPart()).to.be.equal(lockedPartInitial);
    });
    it('Should get the initial locked part if ID is not in the storage', async () => {
        expect(await proxySM.getLockedPart(50)).to.be.equal(lockedPartInitial);
    });
    it('Should throw an error when register a split if the distribution is not equal to 100%.', async () => {
        await expect(proxySM.connect(mockLockSigner).registerSplit(0, [1, 2], calculateParts([0.7, 0.2])))
            .to.be.revertedWith("ERROR: Split must be exactly 100%.");
        await expect(proxySM.connect(mockLockSigner).registerSplit(0, [1, 2], calculateParts([0.7, 0.4])))
            .to.be.revertedWith("ERROR: Split must be exactly 100%.");
    });
    it('Should throw an error when register a split if there are not enough free tokens for a distribution.', async () => {
        await expect(proxySM.connect(mockLockSigner).registerSplit(0, [1, 2], calculateParts([0.75, 0.25])))
            .to.be.revertedWith("ERROR: There are not enough free tokens.");
    });
    it('Should throw an error when the caller of registerSplit is not the address save "lock".', async () => {
        await expect(proxySM.connect(account2).registerSplit(0, [1, 2], calculateParts([0.75, 0.25])))
            .to.be.revertedWith("ERROR: Only lock");
    });
    it('Should register a split in two correctly [80% - 20%]', async () => {
        await proxySM.connect(mockLockSigner).registerSplit(0, [1, 2], calculateParts([0.8, 0.2]));
        expect(await proxySM.getLockedPart(1)).to.be.equal(convertToBN(1));
        expect(await proxySM.getLockedPart(2)).to.be.equal(0);
    });
    it('Should register a split in four correctly [80% - 3.5% - 8.2% - 8.3% ]', async () => {
        await proxySM.connect(mockLockSigner).registerSplit(3, [4, 5, 6, 7], calculateParts([0.8, 0.035, 0.082, 0.083]));
        expect(await proxySM.getLockedPart(4)).to.be.equal(convertToBN(1));
        expect(await proxySM.getLockedPart(5)).to.be.equal(0);
        expect(await proxySM.getLockedPart(6)).to.be.equal(0);
        expect(await proxySM.getLockedPart(7)).to.be.equal(0);
    });
    it('Should register a split that still having lock and free part', async () => {
        await proxySM.connect(mockLockSigner).registerSplit(8, [9, 10, 11], calculateParts([0.9, 0.05, 0.05]));
        const unsplittablePart = calcRelativePercent(await proxySM.getLockedPart(8), convertToBN(0.9));

        expect(await proxySM.getLockedPart(9)).to.be.equal(unsplittablePart);
        expect(await proxySM.getLockedPart(10)).to.be.equal(0);
        expect(await proxySM.getLockedPart(11)).to.be.equal(0);
    });
    it('Should register a split that is totally free', async () => {
        await proxySM.connect(mockLockSigner).registerSplit(2, [12, 13], calculateParts([0.6, 0.4]));

        expect(await proxySM.getLockedPart(12)).to.be.equal(0);
        expect(await proxySM.getLockedPart(13)).to.be.equal(0);
    });
    it('Should throw an error that is totally locked', async () => {
        await expect(proxySM.connect(mockLockSigner).registerSplit(1, [14, 15], calculateParts([0.8, 0.2])))
            .to.be.revertedWith("ERROR: There are not enough free tokens.");
    });
    it('Should throw an error if caller if NOT the Lock', async () => {
        await expect(proxySM.connect(account2).registerSplit(1, [14, 15], calculateParts([0.8, 0.2])))
            .to.be.revertedWith("ERROR: Only lock");
    });
});
describe('Split Manager - "Always allow splitting Rule - Splits/Transactions', () => {
    const lockedPartInitial = convertToBN(0);
    before( async () => {
        const SplitManager = await getSMContract(lockedPartInitial);
        const mockLockAddress = mockLockSigner.address;
        const data =  AbiCoder.encode(["uint256", "address"], [lockedPartInitial, account1.address]);
        proxySM = await upgrades.deployProxy(SplitManager, [mockLockAddress, data], { kind: 'uups' });
    });
    it('Should get the initial locked part if pass ID', async () => {
        expect(await proxySM.getLockedPart(50)).to.be.equal(lockedPartInitial);
    });
    it('Should register a split in two correctly [80% - 20%]', async () => {
        await proxySM.connect(mockLockSigner).registerSplit(0, [1, 2], calculateParts([0.8, 0.2]));

        expect(await proxySM.getLockedPart(1)).to.be.equal(0);
        expect(await proxySM.getLockedPart(2)).to.be.equal(0);
    });
    it('Should register a split in four correctly [80% - 3.5% - 8.2% - 8.3% ]', async () => {
        await proxySM.connect(mockLockSigner).registerSplit(3, [4, 5, 6, 7], calculateParts([0.8, 0.035, 0.082, 0.083]));
        expect(await proxySM.getLockedPart(4)).to.be.equal(0);
        expect(await proxySM.getLockedPart(5)).to.be.equal(0);
        expect(await proxySM.getLockedPart(6)).to.be.equal(0);
        expect(await proxySM.getLockedPart(7)).to.be.equal(0);
    });
    it('Should register a split that was already splitted', async () => {
        await proxySM.connect(mockLockSigner).registerSplit(2, [8, 9], calculateParts([0.6, 0.4]));

        expect(await proxySM.getLockedPart(8)).to.be.equal(0);
        expect(await proxySM.getLockedPart(9)).to.be.equal(0);
    });
    it('Should register a split in two correctly [80% - 20%]', async () => {
        await expect(proxySM.connect(account2).registerSplit(1, [14, 15], calculateParts([0.8, 0.2])))
            .to.be.revertedWith("ERROR: Only lock");
    });
});
describe('Split Manager - "No splitting Rule - Splits/Transactions', () => {
    const lockedPartInitial = convertToBN(1);
    before( async () => {
        const SplitManager = await getSMContract(lockedPartInitial);
        const mockLockAddress = mockLockSigner.address;
        const data =  AbiCoder.encode(["uint256", "address"], [lockedPartInitial, account1.address]);
        proxySM = await upgrades.deployProxy(SplitManager, [mockLockAddress, data], { kind: 'uups' });
        await time.advanceBlock();
    });
    it('Should get the initial locked part if pass ID and equal to 100%', async () => {
        expect(await proxySM.getLockedPart(50)).to.be.equal(lockedPartInitial);
    });
});