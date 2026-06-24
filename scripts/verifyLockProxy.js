const fs = require("fs");
const path = require('path');
const upgradesCore = require("@openzeppelin/upgrades-core");
const hre = require("hardhat");
const ethers = require("ethers");
const commandLineArgs = require('command-line-args')
require("dotenv").config();


const WEB_DEPLOY_SETTINGS = require("../web/settings.json");

const lockImplAddress = WEB_DEPLOY_SETTINGS.lock.address;

const options = commandLineArgs([
    { name: 'network', alias: 'n', type: String },
    { name: 'lock', type: String, defaultOption: true },
]);

async function main() {
    let proxyAddress = options.lock;

    console.log(hre.network);

    if (!ethers.utils.isAddress(proxyAddress)) {
        throw "Bad Lock Proxy address";
    }

    await hre.run("verify:verify", {
        address: proxyAddress,
        constructorArguments: [
            lockImplAddress,
            "0x"
        ],
    });

}

// async function etherscanVerifyProxy() {
//     //Based on https://github.com/nomiclabs/hardhat/issues/1166#issuecomment-805980264 by marcelomorgado 
//     console.log(`Verifying ${proxyName}...`)
//     const proxy = allDeployments[proxyName]
//     const implementation = allDeployments[proxyName.replace("Proxy", "")]

//     const apiSubdomain = network.name === "mainnet" ? "api" : `api-${network.name}`
//     const url = `https://${apiSubdomain}.etherscan.io/api?module=contract&action=verifyproxycontract&apikey=${ETHERSCAN_API_KEY}`
//     const options: AxiosRequestConfig = {
//         method: "POST",
//         headers: { "content-type": "application/x-www-form-urlencoded" },
//         data: qs.stringify({ address: proxy.address, expectedimplementation: implementation.address }),
//         url,
//     }
//     const {
//         data: { message: okOrNotOk, result: guidOrError },
//     } = await axios(options)

//     if (okOrNotOk === "NOTOK") {
//         console.log(`Verification failed. Reason: ${guidOrError}`)
//     } else {
//         console.log(`Verification request sent.`)
//         console.log(`To check the request status, use ${guidOrError} as GUID.`)

//     }
// }


main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
