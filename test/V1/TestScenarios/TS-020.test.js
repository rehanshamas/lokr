const { ethers, upgrades } = require('hardhat');
const keccak256 = require('keccak256');
const { expect } = require('chai');
const { time } = require('@openzeppelin/test-helpers');
const zeroAddress = ethers.constants.AddressZero;
const zeroBN = ethers.constants.Zero;
const AbiCoder = ethers.utils.defaultAbiCoder;
const { calculateParts } = require("../utils");

const toWei = (num) => ethers.utils.parseUnits(num.toString(), 18)

const DEPLOY_CONTRACTS = [
    "LockFactory",
    "Lock",
    "DepositManager",
    "EqualUnlockSchedule",
    "SplitManagerTrue"
];


describe("TS-020", () => {
    let governance;
    let paymentTokens = [];
    let USDT;
    let cryptoPriceFeed;
    let tokenPriceFeed = [];
    let token;
    let instances = {};
    let lockProxy;
    let signer;

    before(async () => {
        [manager, A, B, C] = await ethers.getSigners();
        governance = manager.address;

        let tokenFactory = await ethers.getContractFactory("PolkalokrTestToken");
        token = await tokenFactory.connect(manager).deploy();
        token.mintTo(manager.address, ethers.utils.parseEther('9000'));


        for(let contractName of DEPLOY_CONTRACTS) {
            let factory = await ethers.getContractFactory(contractName);
            let instance = await factory.connect(manager).deploy();
            instances[contractName] = instance;
            await instance.deployTransaction.wait();
        }
        
        signer = await ethers.getImpersonatedSigner("0xf89d7b9c864f589bbF53a82105107622B35EaA40");

        USDT = await ethers.getContractAt("IERC20", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f")

        paymentTokens = [
            "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", //USDC
            "0xc2132d05d31c914a87c6611c10748aeb04b58e8f" //USDT
        ];

        cryptoPriceFeed = "0xd0D5e3DB44DE05E9F294BB0a3bEEaF030DE24Ada"; //MATIC-USD

        tokenPriceFeed = [
            "0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7", //USDC-USD
            "0x0A6513e40db6EB1b165753AD52E80663aeA50545" //USDT-USD
        ];

        const deployFeeConfiguration = ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256', 'address', 'address[]', 'address[]', 'address', 'bytes32'],
            [ethers.utils.parseUnits("10", 'ether'), ethers.utils.parseUnits("0.01", "ether"), A.address, paymentTokens, tokenPriceFeed, cryptoPriceFeed, keccak256('FIXED_PAYMENT_OPTION')])
        await instances.LockFactory.setupDeployFee(deployFeeConfiguration);
    });

    it("Should deploy Lock with lock.canTransfer = true and spitable part", async () => {
        await time.advanceBlock();
        // Prepare deploy fee
        let fee = await instances.LockFactory.getRequiredTokensToPayFee(USDT.address, 0);

        await USDT.connect(signer).transfer(governance, fee[0]);

        await USDT.approve(instances.LockFactory.address, fee[0]);

        //Linear Unlock Schedule
        let shmLockStart = (await time.latest()).toString();
        let shmLockLength = time.duration.days(5);
        let shmLockFirstClaimDelay = time.duration.days(1);

        //Beneficiaries data for the Lock
        let beneficiaries = [A.address, B.address];
        let amounts = [ethers.utils.parseEther('100'), ethers.utils.parseEther('200')];
        let totalAmount = amounts.reduce((s, c)=>(s.add(c)));
        let beneficiariesData = ethers.utils.defaultAbiCoder.encode(['address[]', 'uint256[]'], [beneficiaries, amounts]);

        //Should accept add and remove beneficiaries, but should not allow transfer functionality
        let lockData =  ethers.utils.defaultAbiCoder.encode(
            ['address', 'address', 'address', 'address', 'address', 'bool', 'bool', 'bool', 'uint256'],
            [zeroAddress, zeroAddress, zeroAddress, token.address, governance, true, true, true, totalAmount]
        )
        
        //Lock initializer Data
        let lockAndInitialBeneficiariesData = ethers.utils.defaultAbiCoder.encode(['bytes', 'bytes'], [lockData, beneficiariesData]);

        //Deposit Manager Data
        let depositManagerData = ethers.utils.defaultAbiCoder.encode(['address'], [governance]);

        //Schedule Data
        let scheduleManagerData = ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256', 'uint256', 'address'], [shmLockStart, shmLockLength.toString(), shmLockFirstClaimDelay.toString(), governance]);
        
        //Split Manager Data
        let splitManagerData = ethers.utils.defaultAbiCoder.encode(['address'], [governance]);
        
        let selectPayment = keccak256('FIXED_PAYMENT_OPTION');

        let lockInstancesAndPaymentOption = ethers.utils.defaultAbiCoder.encode(
            ['address', 'address', 'address', 'address', 'address'],
            [instances.Lock.address, instances.DepositManager.address, instances.EqualUnlockSchedule.address, instances.SplitManagerTrue.address, USDT.address])
        
        //Token transaction
        let tx = await token.approve(instances.LockFactory.address, totalAmount);
        await tx.wait();
        
        //Deploy & Initialize all the contracts
        await expect(txPromise = instances.LockFactory.deployLock(
            lockInstancesAndPaymentOption, 
            lockAndInitialBeneficiariesData, 
            depositManagerData, 
            scheduleManagerData, 
            splitManagerData
        ))
            .to.emit(instances.LockFactory, 'Deploy');

        await time.advanceBlock();
        
        tx = await txPromise;
        let receipt = await tx.wait();
        let deployEvent = receipt.events.filter(el=>el.event == "Deploy")[0];
        let lockProxyAddress = deployEvent.args.lockProxy;

        lockProxy = (await ethers.getContractFactory("Lock")).attach(lockProxyAddress);

        await time.advanceBlock();

        //Check if bool are we expect
        expect(await lockProxy.connect(manager).canAddBeneficiaries()).to.be.equal(true);
        expect(await lockProxy.connect(manager).canRemoveBeneficiaries()).to.be.equal(true);
        expect(await lockProxy.connect(manager).canTransfer()).to.be.equal(true);

        // console.log(lockProxy);
    });
    
    it("First day", async () => {
        await lockProxy.connect(A).split(0, calculateParts([0.9 , 0.1]), [A.address, B.address]);
        await lockProxy.connect(B).split(1, calculateParts([0.9 , 0.1]), [A.address, B.address]);
        
        await time.increase(time.duration.days(1));
        // console.log(await lockProxy.getInfoByManyIDs([2,3,4,5]));
        
        await lockProxy.connect(A).claimUnlocked(2,[]);
        expect(await token.balanceOf(A.address)).to.be.equal( toWei(18) );
        await lockProxy.connect(B).claimUnlocked(3,[]);
        expect(await token.balanceOf(B.address)).to.be.equal( toWei(2) );
        await lockProxy.connect(A).claimUnlocked(4,[]);
        expect(await token.balanceOf(A.address)).to.be.equal( toWei(54) );
        await lockProxy.connect(B).claimUnlocked(5,[]);
        expect(await token.balanceOf(B.address)).to.be.equal( toWei(6) );
        
    });

    it("Second day", async () => {
        
        await time.increase(time.duration.days(1));        
        
        await lockProxy.connect(A).claimUnlocked(2,[]);
        expect(await token.balanceOf(A.address)).to.be.equal( toWei(18*4) );
        await lockProxy.connect(B).claimUnlocked(3,[]);
        expect(await token.balanceOf(B.address)).to.be.equal( toWei(2*4) );
        await lockProxy.connect(A).claimUnlocked(4,[]);
        expect(await token.balanceOf(A.address)).to.be.equal( toWei(54*2) );
        await lockProxy.connect(B).claimUnlocked(5,[]);
        expect(await token.balanceOf(B.address)).to.be.equal( toWei(6*2) );
        
    });

    
});