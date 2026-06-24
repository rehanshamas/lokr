const hre = require("hardhat");
const upgradesCore = require("@openzeppelin/upgrades-core");
const { ethers, upgrades } = require("hardhat");

const deployConf = {
    Lock: {
        canAddBeneficiaries: true,
        canRemoveBeneficiaries: true,
        data: "0x",
        lockedAmount:0
    },
    LinearUnlockSchedule: {
        lockTime: 30,   // days
        lockCliff: 0    // days
    },
    SplitManager:{
        initialLockedPart: 0.8
    },
    token: null // address of the token, null means - deploy test token
};

async function main() {
    // Lock
    let lockProxy = await deployContractProxy("Lock", false);

    // LinearUnlockSchedule
    let lusProxy = await deployContractProxy("LinearUnlockSchedule", false);

    // DepositManager
    let dmProxy = await deployContractProxy("DepositManager", false);

    // SplitManager
    let smProxy = await deployContractProxy("SplitManager", false);

    let tokenAddress;
    if(deployConf.token == null) {
        let testTokenProxy = await deployContractProxy("PolkalokrTestToken");
        tokenAddress = testTokenProxy.address;
    }

    // Initialization
    let lockInitTx = await lockProxy.initialize(
        lusProxy.address, dmProxy.address, smProxy.address, 
        tokenAddress, 
        deployConf.Lock.canAddBeneficiaries, deployConf.Lock.canRemoveBeneficiaries, 
        deployConf.Lock.data, deployConf.Lock.lockedAmount
    );
    console.log("Lock proxy initialized");

    let lusInitTx = await lusProxy.initialize(deployConf.LinearUnlockSchedule.lockTime, deployConf.LinearUnlockSchedule.lockCliff);
    console.log("LinearUnlockSchedule proxy initialized");

    let dmInitTx = await dmProxy.initialize(lockProxy.address);
    console.log("DepositManager proxy initialized");

    let smInitTx = await smProxy.initialize(ethers.utils.parseEther(String(deployConf.SplitManager.initialLockedPart)), lockProxy.address);
    console.log("SplitManager proxy initialized");
}

async function deployContractProxy(contractName, initialize=null) {
    const { provider } = hre.network;

    const cf = await ethers.getContractFactory(contractName);
    const proxy = await upgrades.deployProxy(cf, { kind: 'uups', initializer: initialize});
    await proxy.deployed();
    console.log(`${contractName} proxy deployed to ${proxy.address}`);

    let implAddr = await upgradesCore.getImplementationAddress(provider, proxy.address);
    console.log(`${contractName} implementation deployed to ${implAddr}`);

    try {
        await hre.run("verify:verify", {address: implAddr});
        console.log(`${contractName} implementation verified.`);
    }catch(ex){
        if(ex.message.includes("already verified")){
            console.log(`${contractName} implementation already verified`);
        }else{
            console.error(`${contractName}  verification failed with reason: ${ex.message}`);
        }
    }

    return proxy;
}


main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
