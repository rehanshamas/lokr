// test/intervalUlock-test.js

const { ethers, upgrades } = require('hardhat');
const { expect } = require("chai");
const { time } = require('@openzeppelin/test-helpers');
const {calculateParts, convertToBN, calcRelativePercent, getSMContract} = require("../utils");
const BN = ethers.BigNumber;
const AbiCoder = ethers.utils.defaultAbiCoder;

describe('Interval unlock Test', function () {
  before( async () => {
    [governance, mockLockSigner] = await ethers.getSigners();
  });
  it('Deploys and returns the unlocked amount', async function () {
    const mockLockAddress = mockLockSigner.address;
    const lockStartTime = ethers.BigNumber.from((await time.latest()).toString());
    const unlockTime1 = lockStartTime.add(time.duration.days(2).toString());
    const unlockTime2 = lockStartTime.add(time.duration.days(4).toString());
    const unlockTime3 = lockStartTime.add(time.duration.days(6).toString());
    const keyPoints = [unlockTime1, unlockTime2, unlockTime3];

    const amounts = [600, 450, 550];
    const initAmount = amounts.reduce((a, b) => a + b);
    const amountsNormalized = normalize(amounts, initAmount);

    const data =  AbiCoder.encode(["uint256[]", "uint256[]", "address"], [keyPoints, amountsNormalized, governance.address]);
    // (uint256[] memory _keyPoints, uint256[] memory _amounts) = abi.decode(_data, (uint256[], uint256[]));
    const args = [mockLockAddress, data];

    const IntervalUnlock = await ethers.getContractFactory('IntervalUnlockSchedule');
    const intervalUnlock = await upgrades.deployProxy(
      IntervalUnlock, 
      args, 
      { kind: 'uups' })
    ;
    
    await time.increase(time.duration.days(5));
    expect(await intervalUnlock.unlockedAmount(initAmount)).to.be.equal(1050);
  });
});

const normalize = (amounts, init) => {
  const exp = convertToBN(1);
  const amountsNorm = [];
  let aux = BN.from(0);
  for(let i=0; i < amounts.length; i++) {
    amountsNorm.push(BN.from(amounts[i]).mul(exp).div(init));
    aux = aux.add(amountsNorm[i]);
  }
  if (!aux.eq(exp)) {
    const lastPosition = amountsNorm.length - 1;
    amountsNorm[lastPosition] = amountsNorm[lastPosition].add(1);
  }
  return amountsNorm;
}