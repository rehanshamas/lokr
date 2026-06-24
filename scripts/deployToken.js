const hre = require("hardhat");
const ethers = hre.ethers;


async function main() {
  // We get the contract to deploy
  const PolkalokrTestToken = await ethers.getContractFactory("PolkalokrTestToken");
  const polkalokrTestToken = await PolkalokrTestToken.deploy();

  console.log("Token deployed to:", polkalokrTestToken.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });