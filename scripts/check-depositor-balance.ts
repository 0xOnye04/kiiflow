import dotenv from "dotenv";
import hre from "hardhat";

dotenv.config();

const { ethers, network } = hre;

async function main() {
  if (network.name !== "kiiChainTestnet") {
    throw new Error("Use --network kiiChainTestnet");
  }

  const [depositor] = await ethers.getSigners();
  if (!depositor) {
    throw new Error("No depositor wallet configured. Set DEPLOYER_PRIVATE_KEY or PRIVATE_KEY.");
  }

  const balance = await ethers.provider.getBalance(depositor.address);

  console.log("Network:", network.name);
  console.log("Depositor:", depositor.address);
  console.log("Balance:", ethers.formatEther(balance), "KII");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
