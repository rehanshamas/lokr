const fsp  = require("fs").promises;
const path = require('path');
const upgradesCore = require("@openzeppelin/upgrades-core");
const hre = require("hardhat");

const DEPLOY_CONTRACTS = [
    // "LockFactory",
    // "Lock",
    // "DepositManager",
    "DepositManagerMT",
    // "LinearUnlockSchedule",
    // "IntervalUnlockSchedule",
    // "EqualUnlockSchedule",
    // "DateUnlockSchedule",
    // "SplitManager",
    // "SplitManagerFalse",
    // "SplitManagerTrue",
    // "FixedValueLock",
    // "FixedValueDepositManager",
];

const DEPLOYED_CONTRACTS = { 
    // 'LockFactory':'0xb59606B87136bFaA9cCeF5fffe0c3240eb0D7345',
    // 'Lock':'0x70a18a8f8a89E16479C4A3C5004a51Aa1F2483c0',
    // 'DepositManager':'0xb3ad409f0B88839c51684398d15E97464292DF3D',
    'DepositManagerMT':'0xC2F184C104bd0441D09ccb05a3E992dA31792019',
    // 'LinearUnlockSchedule':'0xD2682184E577954287c23DaaCbC0F8b737897870',
    // 'IntervalUnlockSchedule':'0xAD3653e908C4B9640848a69538915B3e0067aE3d',
    // 'EqualUnlockSchedule':'0x595A0a7Af61b9c7cf67E7c1b22b4B3c8A55e7C42',
    // 'DateUnlockSchedule':'0x038F6c2E23109d377A2beca9088F7B8f63669b0C',
    // 'SplitManager':'0x65b2C6Ed7dF66526ACd4A45d66eA158b1A0663f9',
    // 'SplitManagerFalse':'0x4a3466f92Ad04ee34423197eC646ccaDB6e6b7e2',
    // 'SplitManagerTrue':'0x41a1dC8Ae6c4a2466E03CaF4d3988906239575Ea',
    // 'FixedValueLock': '0x15DD9aE0fA5964ADb9DB7c00F628EC0EBb6FE054',
    // 'FixedValueDepositManager': '0x5324378714edb13f7CbC9EAb7833C3b553f3e14e'
};

async function main() {
    console.log('Verifying contracts...')
    for(let contractName of DEPLOY_CONTRACTS) {

        try {
            await run("verify:verify", { address: DEPLOYED_CONTRACTS[contractName] });
            console.log(`${contractName} verified`);
        } catch (ex) {
            if (ex.message.includes("already verified")) {
                console.log(`${contractName} already verified`);
            } else {
                console.error(`${contractName} verification failed with reason: ${ex.message}`);
            }
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });