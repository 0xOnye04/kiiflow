import dotenv from "dotenv";
import hre from "hardhat";

dotenv.config();

const { ethers, network } = hre;

async function main() {
  if (network.name !== "kiiChainTestnet") {
    throw new Error("Use --network kiiChainTestnet");
  }

  const paymasterAddress = process.env.PAYMASTER_ADDRESS;
  if (!paymasterAddress || !ethers.isAddress(paymasterAddress)) {
    throw new Error("PAYMASTER_ADDRESS is required");
  }

  const topUpAmount = ethers.parseEther(process.env.PAYMASTER_TOPUP_KII ?? "1");
  if (topUpAmount <= BigInt(0)) {
    throw new Error("PAYMASTER_TOPUP_KII must be greater than zero");
  }

  const [deployer] = await ethers.getSigners();
  const paymaster = await ethers.getContractAt("StablecoinPaymaster", paymasterAddress);
  const before = await paymaster.getDeposit();

  console.log("Network:", network.name);
  console.log("Paymaster:", paymasterAddress);
  console.log("Depositor:", deployer.address);
  console.log("Deposit before:", ethers.formatEther(before), "KII");
  console.log("Top up:", ethers.formatEther(topUpAmount), "KII");

  const tx = await paymaster.deposit({ value: topUpAmount });
  const receipt = await tx.wait();
  const after = await paymaster.getDeposit();

  console.log("Top-up tx:", receipt?.hash ?? tx.hash);
  console.log("Deposit after:", ethers.formatEther(after), "KII");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
