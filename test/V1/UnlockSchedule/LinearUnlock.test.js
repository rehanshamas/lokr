// test/linearUnlock-test.js

const { ethers, upgrades } = require('hardhat');
const { expect } = require("chai");
const { time } = require('@openzeppelin/test-helpers');
const AbiCoder = ethers.utils.defaultAbiCoder;

describe('Linear unlock Test', function () {
  before( async () => {
    [governance, mockLockSigner] = await ethers.getSigners();
  });
  it('Deploys and return unlocked amounts', async function () {
    const lockTime = 10; // 10 days
    const lockCycle = 1;
    const lockStartTime = (await time.latest()).toString();
	const lockCliffTime =  lockStartTime;
    const lockEndTime = parseInt(lockStartTime, 10) + lockTime * 86400;
    const mockLockAddress = mockLockSigner.address;

    const data =  AbiCoder.encode(["uint256", "uint256", "uint256", "address"], [lockStartTime, lockEndTime, lockCliffTime, governance.address]);
    const args = [mockLockAddress, data];
    
    const LinearUnlock = await ethers.getContractFactory('LinearUnlockSchedule');
    const linearUnlock = await upgrades.deployProxy(
      LinearUnlock, 
      args,
      { kind: 'uups' }
    );
    
    expect(await linearUnlock.lockEnd()).to.be.equal(lockEndTime)

    for(let i = 0; i <= lockTime; i += lockCycle) {
      expect(await linearUnlock.unlockedAmount(1000)).to.equal(i*100);
      await time.increase(time.duration.days(1));
    }
  });
});