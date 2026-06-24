const { ethers } = require('hardhat');
const { MerkleTree } = require('merkletreejs')
const keccak256 = require('keccak256');
const hexZeroPad = ethers.utils.hexZeroPad;

const calculateParts = (percentages) => {
    const parts = percentages.length;
    const distribution = [];
    for(let i = 0; i < parts; i++) {
        const part = convertToBN(percentages[i]);
        distribution.push(part);
    }
    return distribution;
}
const convertToBN = (value) => {
    ethers.utils.parseEther(value.toString())
    return ethers.utils.parseEther(value.toString());
}
const calcRelativePercent = (a, b) => {
    return convertToBN(1).mul(convertToBN(a)).div(convertToBN(b))
}
const getSMContract = (initPartLocked) => {
    if(initPartLocked.isZero()) {
        return ethers.getContractFactory("SplitManagerTrue");
    } else if (initPartLocked.eq(convertToBN(1))) {
        return ethers.getContractFactory("SplitManagerFalse");
    } else{
        return ethers.getContractFactory("SplitManager");
    }
}

const makeTree = (addresses, amounts) => {
    const data = [];
    for(let i=0; i < addresses.length; i++) {
        const aux = hexZeroPad(amounts[i].toHexString(), 32).slice(2);
        data.push(addresses[i] + aux);
    }
    const tree = new MerkleTree(data, keccak256, {sort:true, hashLeaves:true})

    return tree;
}

const getRemainedAmount = async (id, lockContract) => {
    const [,lockedAmount,,] = await lockContract.getInfoBySingleID(id);
    return lockedAmount;
}

module.exports = {
    calculateParts, 
    convertToBN, 
    calcRelativePercent, 
    getSMContract, 
    makeTree, 
    getRemainedAmount
};