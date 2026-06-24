const { ethers, upgrades } = require('hardhat');
const { expect } = require("chai");
const { time } = require('@openzeppelin/test-helpers');
const {calculateParts, convertToBN, calcRelativePercent, getSMContract} = require("../utils");
const BN = ethers.BigNumber;
const AbiCoder = ethers.utils.defaultAbiCoder;

let upkeepConsumer;

describe('Event unlock Test', function () {
  before( async () => {
    [governance, mockLockSigner] = await ethers.getSigners();

    const UpkeepConsumer = await ethers.getContractFactory("UpkeepConsumer");
    //polygon mainnet instances
    upkeepConsumer = await UpkeepConsumer.deploy(
      "0xb0897686c545045aFc77CF20eC7A532E3120E0F1",//LINK token
      "0xDb8e8e2ccb5C033938736aa89Fe4fa1eDfD15a1d",//registrar
      "0x02777053d6764996e594c3E88AF1D58D5363a2e6"//registry
    );

  });
  it('Deploys and returns the unlocked amount', async function () {
    const mockLockAddress = mockLockSigner.address;
    const lockStartTime = ethers.BigNumber.from((await time.latest()).toString());
    const lockEndTime = lockStartTime.add(time.duration.days(2).toString());
    const feedAddress = "0xF9680D99D6C9589e2a93a78A04A279e509205945";//Chainlink LINK/USD PolygonFeed
    const conditions = [2, 1, 2];
    const offsetPrices = [ethers.utils.parseUnits(`1`, 8), ethers.utils.parseUnits(`9999`, 8), ethers.utils.parseUnits(`1.5`, 8)];
    const slots = [ethers.utils.parseUnits("41",18), ethers.utils.parseUnits("22.5",18), ethers.utils.parseUnits("36.5",18)];
    const amounts = slots?.map((t) => t.div(100));
    const initAmount = 100;
    const data =  AbiCoder.encode(
      ["uint256", "uint256", "uint256[]", "int256[]", "uint256[]", "address", "address", "bool"], 
      [lockStartTime, lockEndTime, conditions, offsetPrices, amounts, feedAddress, governance.address, true]);

    const args = [mockLockAddress, data];

    const performData = AbiCoder.encode(
      ["address", "address"],
      ["0x0000000000000000000000000000000000000000",upkeepConsumer.address]
    );

    const EventUnlock = await ethers.getContractFactory('EventUnlockSchedule');
    const eventUnlock = await upgrades.deployProxy(
      EventUnlock, 
      args, 
      { kind: 'uups' })
    ;
    
    await eventUnlock.performUpkeep(performData);
    expect(await eventUnlock.unlockedAmount(initAmount)).to.be.equal(100);

  });
});
