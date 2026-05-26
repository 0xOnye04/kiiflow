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

  const paymaster = await ethers.getContractAt("StablecoinPaymaster", paymasterAddress);
  const deposit = await paymaster.getDeposit();
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? ethers.parseUnits("45", "gwei");

  const estimatedFirstRunGas =
    BigInt(3_000_000) + BigInt(220_000) + BigInt(120_000) + BigInt(300_000) + BigInt(180_000);
  const requiredPrefund = estimatedFirstRunGas * gasPrice;
  const recommended = (requiredPrefund * BigInt(2));

  console.log("Network:", network.name);
  console.log("Paymaster:", paymasterAddress);
  console.log("Deposit:", ethers.formatEther(deposit), "KII");
  console.log("Gas price:", ethers.formatUnits(gasPrice, "gwei"), "gwei");
  console.log("Estimated first-run prefund:", ethers.formatEther(requiredPrefund), "KII");
  console.log("Recommended minimum:", ethers.formatEther(recommended), "KII");

  if (deposit < recommended) {
    throw new Error(`Paymaster deposit too low. Top up at least ${ethers.formatEther(recommended - deposit)} KII.`);
  }

  console.log("Paymaster deposit is ready.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
