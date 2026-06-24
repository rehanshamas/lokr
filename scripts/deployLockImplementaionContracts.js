const fsp  = require("fs").promises;
const path = require('path');
const upgradesCore = require("@openzeppelin/upgrades-core");
const hre = require("hardhat");
const { ethers, upgrades } = hre;

const DEPLOY_CONTRACTS = [
    "LockFactory",
    "Lock",
    "DepositManager",
    "DepositManagerMT",
    "LinearUnlockSchedule",
    "IntervalUnlockSchedule",
    "EqualUnlockSchedule",
    "DateUnlockSchedule",
    "SplitManager",
    "SplitManagerFalse",
    "SplitManagerTrue",
    "FixedValueLock",
    "FixedValueDepositManager",
];

const INSTANCES_STORE = path.resolve(__dirname, "../deployed_instances.json");

async function timeoutPromise(task, ms) {
    return new Promise(resolve => setTimeout(async function(){
        await task(); 
        resolve();
    }, ms));
}

async function main() {
    let instances = {};
    let confirmationPromises = [];
    for(let contractName of DEPLOY_CONTRACTS) {
        console.log(`Deploying ${contractName} implementation:`);
        console.group();
        let factory = await ethers.getContractFactory(contractName);
        let instance = await factory.deploy();
        await instance.deployed();
        console.log(`Will be deployed at ${instance.address}. Tx: ${instance.deployTransaction.hash}`);
        instances[contractName] = instance.address;

        confirmationPromises.push(instance.deployTransaction.wait(7));
        console.groupEnd();
    }

    console.log('Waiting for all contracts to be deployed and have 5 confirmations...')
    let allDeployed = await Promise.allSettled(confirmationPromises);

    console.log('Verifying contracts...')
    for(let contractName of DEPLOY_CONTRACTS) {

        try {
            await run("verify:verify", { address: instances[contractName] });
            console.log(`${contractName} verified`);
        } catch (ex) {
            if (ex.message.includes("already verified")) {
                console.log(`${contractName} already verified`);
            } else {
                console.error(`${contractName} verification failed with reason: ${ex.message}`);
            }
        }
    }

    await fsp.writeFile(INSTANCES_STORE, JSON.stringify(instances, null, 4));
    console.log(`List of implementations stored in ${INSTANCES_STORE}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
