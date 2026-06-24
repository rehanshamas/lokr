const { ethers, upgrades } = require('hardhat');
const keccak256 = require('keccak256');
const { expect } = require('chai');
const { time } = require('@openzeppelin/test-helpers');
const zeroAddress = ethers.constants.AddressZero;
const zeroBN = ethers.constants.Zero;
const AbiCoder = ethers.utils.defaultAbiCoder;
const { calculateParts } = require("../utils");

const DEPLOY_CONTRACTS = [
    "LockFactory",
    "Lock",
    "DepositManager",
    "EqualUnlockSchedule",
    "SplitManagerTrue"
];


describe("Lock Third Scenario", () => {
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
        [account1, account2, account3, account4, account5, account6, account7] = await ethers.getSigners();
        governance = account1.address;

        signer = await ethers.getImpersonatedSigner("0xf89d7b9c864f589bbF53a82105107622B35EaA40");

        USDT = await ethers.getContractAt("IERC20", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f")

        let tokenFactory = await ethers.getContractFactory("PolkalokrTestToken");
        token = await tokenFactory.deploy();
        token.mintTo(account1.address, ethers.utils.parseEther('10000'));

        paymentTokens = [
            "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", //USDC
            "0xc2132d05d31c914a87c6611c10748aeb04b58e8f" //USDT
        ];

        cryptoPriceFeed = "0xd0D5e3DB44DE05E9F294BB0a3bEEaF030DE24Ada"; //MATIC-USD

        tokenPriceFeed = [
            "0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7", //USDC-USD
            "0x0A6513e40db6EB1b165753AD52E80663aeA50545" //USDT-USD
        ];

        for (let contractName of DEPLOY_CONTRACTS) {
            let factory = await ethers.getContractFactory(contractName);
            let instance = await factory.deploy();
            instances[contractName] = instance;
            await instance.deployTransaction.wait();
        }

        //Set Up fee
        const deployFeeConfiguration = ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256', 'address', 'address[]', 'address[]', 'address', 'bytes32'],
            [ethers.utils.parseUnits("100", 'ether'), ethers.utils.parseUnits("1", "ether"), account7.address, paymentTokens, tokenPriceFeed, cryptoPriceFeed, keccak256('FIXED_PAYMENT_OPTION')])
        await instances.LockFactory.setupDeployFee(deployFeeConfiguration);
    });

    it("Should deploy Lock with lock.canTransfer = true and no non-spitable part", async () => {
        await time.advanceBlock();
        // Prepare deploy fee
        let fee = await instances.LockFactory.getRequiredTokensToPayFee(USDT.address, 0);

        await USDT.connect(signer).transfer(account1.address, fee[0]);

        await USDT.connect(account1).approve(instances.LockFactory.address, fee[0]);

        //Linear Unlock Schedule
        let shmLockStart = (await time.latest()).toString();
        let shmLockLength = time.duration.years(1);
        let shmLockFirstClaimDelay = time.duration.days(30);

        //Beneficiaries data for the Lock
        let beneficiaries = [account4.address, account5.address];
        let amounts = [ethers.utils.parseEther('400'), ethers.utils.parseEther('600')];
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
        
        let tx = await token.approve(instances.LockFactory.address, totalAmount);
        await tx.wait();

        // Deploy Lock

        let txPromise;
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
        expect(await lockProxy.connect(account1).canAddBeneficiaries()).to.be.equal(true);
        expect(await lockProxy.connect(account1).canRemoveBeneficiaries()).to.be.equal(true);
        expect(await lockProxy.connect(account1).canTransfer()).to.be.equal(true);


        //Get the first NFT info
        //console.log(await lockProxy.connect(account1).getInfoBySingleID(0));

        //Should make a Split of 40%, 30% & 30%
        const splitAddresses = [account1.address, account2.address, account3.address];
        const splitOrigin = 1;
        const splitParts = calculateParts([0.4, 0.3, 0.3]);
        await lockProxy.connect(account5).split(splitOrigin, splitParts, splitAddresses, []);
        
        //Should transfer the new NFT
        await lockProxy.connect(account1).transferFrom(account1.address, account2.address, 2);
    });
});