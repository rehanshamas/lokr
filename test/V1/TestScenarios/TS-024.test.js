const { ethers, upgrades } = require('hardhat');
const { expect } = require("chai");
const { time } = require('@openzeppelin/test-helpers');
const {calculateParts, convertToBN, calcRelativePercent, getSMContract} = require("../utils");
const BN = ethers.BigNumber;
const AbiCoder = ethers.utils.defaultAbiCoder;

let upkeepConsumer;
// Proxy
const ProxyInitializerFalse = { 
  initializer: false, 
  kind: 'uups' 
};

describe('TS-024', function () {
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
  it('Should unlock 0% before lock starts', async function () {
    const mockLockAddress = mockLockSigner.address;
    const lockStartTime = ethers.BigNumber.from((await time.latest()).toString());
    const lockStartTimeOffset = lockStartTime.add(time.duration.days(2).toString());
    const lockEndTime = lockStartTimeOffset.add(time.duration.days(2).toString());
    const feedAddress = "0xF9680D99D6C9589e2a93a78A04A279e509205945";//Chainlink LINK/USD PolygonFeed
    const conditions = [2, 1, 2];
    const offsetPrices = [ethers.utils.parseUnits(`1.2`, 8), ethers.utils.parseUnits(`9999`, 8), ethers.utils.parseUnits(`1.4`, 8)];
    const slots = [ethers.utils.parseUnits("38",18), ethers.utils.parseUnits("26.5",18), ethers.utils.parseUnits("35.5",18)];
    const amounts = slots?.map((t) => t.div(100));
    const initAmount = 100;
    const data =  AbiCoder.encode(
      ["uint256", "uint256", "uint256[]", "int256[]", "uint256[]", "address", "address", "bool"], 
      [lockStartTimeOffset, lockEndTime, conditions, offsetPrices, amounts, feedAddress, governance.address, true]);
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
    expect(await eventUnlock.unlockedAmount(initAmount)).to.be.equal(0);
  });
  it('Should unlock 0% after lock ends', async function () {
    const mockLockAddress = mockLockSigner.address;
    const lockStartTime = ethers.BigNumber.from((await time.latest()).toString());
    const lockEndTime = lockStartTime.add(time.duration.days(2).toString());
    const feedAddress = "0xF9680D99D6C9589e2a93a78A04A279e509205945";//Chainlink LINK/USD PolygonFeed
    const conditions = [0, 0, 0];
    const offsetPrices = [ethers.utils.parseUnits(`300`, 8), ethers.utils.parseUnits(`300`, 8), ethers.utils.parseUnits(`300`, 8)];
    const slots = [ethers.utils.parseUnits("38",18), ethers.utils.parseUnits("26.5",18), ethers.utils.parseUnits("35.5",18)];
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
    await time.increase(time.duration.days(2));
    await eventUnlock.performUpkeep(performData);
    expect(await eventUnlock.unlockedAmount(initAmount)).to.be.equal(0);
  });
  it('Should unlock 50% after lock ends', async function () {
    const mockLockAddress = mockLockSigner.address;
    const lockStartTime = ethers.BigNumber.from((await time.latest()).toString());
    const lockEndTime = lockStartTime.add(time.duration.days(2).toString());
    const feedAddress = "0xF9680D99D6C9589e2a93a78A04A279e509205945";//Chainlink LINK/USD PolygonFeed
    const conditions = [0, 2, 0];
    const offsetPrices = [ethers.utils.parseUnits(`10`, 8), ethers.utils.parseUnits(`15`, 8), ethers.utils.parseUnits(`12`, 8)];
    const slots = [ethers.utils.parseUnits("38",18), ethers.utils.parseUnits("50",18), ethers.utils.parseUnits("12",18)];
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
    await time.increase(time.duration.days(1));
    await eventUnlock.performUpkeep(performData);
    await time.increase(time.duration.days(1));
    expect(await eventUnlock.unlockedAmount(initAmount)).to.be.equal(50);
  });
  it('Should let beneficiaries claim 100% after lock ends', async function () {
    const mockLockAddress = mockLockSigner.address;
    const lockStartTime = ethers.BigNumber.from((await time.latest()).toString());
    const lockEndTime = lockStartTime.add(time.duration.days(2).toString());
    const feedAddress = "0xF9680D99D6C9589e2a93a78A04A279e509205945";//Chainlink LINK/USD PolygonFeed
    const conditions = [1, 2, 1, 2];
    const offsetPrices = [ethers.utils.parseUnits(`9999`, 8), ethers.utils.parseUnits(`1`, 8), ethers.utils.parseUnits(`9888`, 8), ethers.utils.parseUnits(`2.5`, 8)];
    const slots = [ethers.utils.parseUnits("30",18), ethers.utils.parseUnits("41",18), ethers.utils.parseUnits("13",18), ethers.utils.parseUnits("16",18)];
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
    await time.increase(time.duration.days(1));
    await eventUnlock.performUpkeep(performData);
    await time.increase(time.duration.days(1));
    expect(await eventUnlock.unlockedAmount(initAmount)).to.be.equal(100);
  });
});
