const { ethers } = require('hardhat');
const keccak256 = require('keccak256');
const { expect } = require('chai');
const { time } = require('@openzeppelin/test-helpers');
const zeroAddress = ethers.constants.AddressZero;


const DEPLOY_CONTRACTS = [
    "LockFactory",
    "Lock",
    "DepositManager",
    "EqualUnlockSchedule",
    "SplitManager"
];


describe("LockFactory", () => {
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
        token.mintTo(account2.address, ethers.utils.parseEther('10000'));

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

    it("Should deploy Lock", async () => {
        // Prepare deploy fee
        let fee = await instances.LockFactory.getRequiredTokensToPayFee(USDT.address, 0);

        await USDT.connect(signer).transfer(account2.address, fee[0]);

        await USDT.connect(account2).approve(instances.LockFactory.address, fee[0]);
        

        // Prepare Lock data
        let smInitialLockedPart = ethers.utils.parseUnits("0.7", 'ether');
        await time.advanceBlock();

        let shmLockStart = (await time.latest()).toString();

        let shmLockLength = time.duration.years(1);
        let shmLockEnd = (await time.latest()).add(shmLockLength).toString();
        let shmLockFirstClaimDelay = time.duration.days(30);
        let shmCliff = (await time.latest()).add(shmLockFirstClaimDelay).toString();

        let beneficiaries = [account4.address, account5.address];
        let amounts = [ethers.utils.parseEther('400'), ethers.utils.parseEther('600')];
        let totalAmount = amounts.reduce((s, c) => (s.add(c)));

        let lockData = ethers.utils.defaultAbiCoder.encode(
            ['address', 'address', 'address', 'address', 'address', 'bool', 'bool', 'bool', 'uint256'],
            [zeroAddress, zeroAddress, zeroAddress, token.address, governance, true, true, true, totalAmount]
        )

        let beneficiariesData = ethers.utils.defaultAbiCoder.encode(['address[]', 'uint256[]'], [beneficiaries, amounts]);
        let lockAndInitialBeneficiariesData = ethers.utils.defaultAbiCoder.encode(['bytes', 'bytes'], [lockData, beneficiariesData]);

        let depositManagerData = ethers.utils.defaultAbiCoder.encode(['address'], [governance]);

        let scheduleManagerData = ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256', 'uint256', 'address'], [shmLockStart, shmLockLength.toString(), shmLockFirstClaimDelay.toString(), governance]);


        let splitManagerData = ethers.utils.defaultAbiCoder.encode(['uint256', 'address'], [smInitialLockedPart, governance]);

        let lockInstances = ethers.utils.defaultAbiCoder.encode(
            ['address', 'address', 'address', 'address', 'address'],
            [instances.Lock.address, instances.DepositManager.address, instances.EqualUnlockSchedule.address, instances.SplitManager.address, USDT.address])

        let tx = await token.connect(account2).approve(instances.LockFactory.address, totalAmount);
        await tx.wait();

        // Deploy Lock

        let txPromise;
        await expect(txPromise = instances.LockFactory.connect(account2).deployLock(
            lockInstances,
            lockAndInitialBeneficiariesData,
            depositManagerData,
            scheduleManagerData,
            splitManagerData
        ))
            .to.emit(instances.LockFactory, 'Deploy');

        tx = await txPromise;
        let receipt = await tx.wait();

        let deployEvent = receipt.events.filter(el => el.event == "Deploy")[0];

        let lockProxyAddress = deployEvent.args.lockProxy;

        lockProxy = (await ethers.getContractFactory("Lock")).attach(lockProxyAddress);

        //Check deploy fee is sent to beneficiary
        console.log(await USDT.balanceOf(await instances.LockFactory.deployFeeBeneficiary()), fee[0])
        
        expect(await USDT.balanceOf(await instances.LockFactory.deployFeeBeneficiary())).to.be.equal(fee[0]);
    });

    it("Lock should have correct totalSupply() and info", async () => {
        let totalSupply = await lockProxy.totalSupply();
        //console.log(totalSupply);
        expect(totalSupply).to.be.equal("2");

        for (let i = 0; i < Number(totalSupply.toString()); i++) {
            let nftInfo = await lockProxy.getInfoBySingleID(i);
            //console.log(nftInfo);
        }
    });
    it("Beneficiary Should be able to claim", async () => {
        [account1, account2, account3, account4, account5, account6, account7] = await ethers.getSigners();
        await time.increase(time.duration.days(60)); //forward time to 2 months

        let stateBefore = {
            balance: await token.balanceOf(account4.address)
        }
        let lockProxyForBeneficiary0 = lockProxy.connect(account4);

        let tx = await lockProxyForBeneficiary0.claimUnlocked(0);
        let receipt = await tx.wait();

        //console.log(receipt);
        let claimed = receipt.events.find(l => l.event == "Claimed").args.amount;
        //console.log(claimed.toString());

        let stateAfter = {
            balance: await token.balanceOf(account4.address)
        }
        expect(stateAfter.balance).to.be.eq(stateBefore.balance.add(claimed));

    });

    it("should return array of Addresses of specific role", async () => {

        // const role = keccak256('FACTORY_MANAGER');
        
        const addresses = await  instances.LockFactory.getAllRoleMember(keccak256('FACTORY_MANAGER'),);
        
        expect(addresses).to.be.an('array');
        
        });
        it("should check the length of array ", async () => {
           
            const addresses = await  instances.LockFactory.getAllRoleMember(keccak256('FACTORY_MANAGER'));
    
            const addressLength = await  instances.LockFactory.getRoleMemberCount(keccak256('FACTORY_MANAGER'));
    
            expect(addresses).to.have.lengthOf(addressLength)
        });
    
});

