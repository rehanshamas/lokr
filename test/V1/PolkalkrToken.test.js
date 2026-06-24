// PolkalkrToken.test.js
const { convertToBN } = require("./utils");
const { ethers, upgrades } = require('hardhat');
const { expect } = require("chai");
let token;
describe('Polkalokr Test Token', function () {
  before(async () => {
    [account1, account2, account3, account4] = await ethers.getSigners();
  });
  it('Deploy token test', async () => {
    const MyTestTokenV1 = await ethers.getContractFactory('PolkalokrTestToken');
    token = await upgrades.deployProxy(MyTestTokenV1, [1000], { kind: 'uups' });

    expect(await token.totalSupply()).to.be.equal(convertToBN(1000));
    expect(await token.balanceOf(account1.address)).to.be.equal(convertToBN(1000));
    const eventFilter = await token.filters.Snapshot(); 
    const event = await token.queryFilter(eventFilter, "latest");
    expect(event[0].args.id).to.be.equal(1);
    expect(await token.getCurrentSnapshotId()).to.be.equal(1);
  });
  it('Should transfer correctly and make the snapshot', async () => {
    const amountToSend = convertToBN(250);
    const balanceBefore = await token.balanceOf(account1.address);
    await token.connect(account1).transfer(account2.address, amountToSend);

    expect(await token.balanceOf(account1.address)).to.be.equal(balanceBefore.sub(amountToSend));
    expect(await token.balanceOfAt(account1.address, 1)).to.be.equal(convertToBN(1000));
    
    expect(await token.balanceOf(account2.address)).to.be.equal(amountToSend);
    expect(await token.balanceOfAt(account2.address, 1)).to.be.equal(0);
  });
  it('Should make a snapshot, transfer and pause correctly', async () => {
    const amountToSend = convertToBN(250);
    await token.snapshot();
    await token.connect(account1).transfer(account3.address, amountToSend);
    
    expect(await token.balanceOf(account1.address)).to.be.equal(convertToBN(750).sub(amountToSend));
    expect(await token.balanceOfAt(account1.address, 1)).to.be.equal(convertToBN(1000));
    expect(await token.balanceOfAt(account1.address, 2)).to.be.equal(convertToBN(750));

    expect(await token.balanceOf(account3.address)).to.be.equal(amountToSend);
    expect(await token.balanceOfAt(account3.address, 1)).to.be.equal(0);
    expect(await token.balanceOfAt(account3.address, 2)).to.be.equal(0);

    await token.pause(true);

    await expect(token.connect(account1).transfer(account4.address, amountToSend))
      .to.be.revertedWith("ERC20Pausable: token transfer while paused");
  });
  it('Should unpause and transfer', async () => {
    const amountToSend = convertToBN(50);
    const balanceBeforeAcc2 = await token.balanceOf(account2.address);
    const balanceBeforeAcc3 = await token.balanceOf(account3.address);

    await token.pause(false);
    await token.connect(account2).transfer(account3.address, amountToSend);

    expect(await token.balanceOf(account2.address)).to.be.equal(balanceBeforeAcc2.sub(amountToSend));
    expect(await token.balanceOf(account3.address)).to.be.equal(balanceBeforeAcc3.add(amountToSend));
  });
});