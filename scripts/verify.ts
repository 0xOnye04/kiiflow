import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

/**
 * Post-Deployment Verification Script
 *
 * This script verifies that deployed contracts are working correctly on KiiChain testnet.
 * Run after deployment: npx ts-node scripts/verify.ts
 */

async function main() {
  console.log("🔍 KiiFlow Contract Verification\n");

  // Read deployment data
  const deploymentPath = path.resolve(__dirname, "../deployments/kiiChainTestnet.json");
  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ No deployment data found. Run deployment script first.");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  console.log("📋 Deployment Info:");
  console.log(`   Network: ${deployment.network}`);
  console.log(`   Chain ID: ${deployment.chainId}`);
  console.log(`   Deployer: ${deployment.deployer}`);
  console.log(`   Timestamp: ${deployment.timestamp}\n`);

  const [signer] = await ethers.getSigners();
  console.log(`📍 Current Signer: ${signer.address}\n`);

  // SimpleSwap verification
  console.log("=== SimpleSwap Contract ===\n");
  const SimpleSwap = await ethers.getContractFactory("SimpleSwap");
  const simpleSwap = SimpleSwap.attach(deployment.simpleSwap);

  try {
    const owner = await simpleSwap.owner();
    console.log(`✅ Contract deployed at: ${deployment.simpleSwap}`);
    console.log(`   Owner: ${owner}`);

    const feeBps = await simpleSwap.feeBps();
    console.log(`   Fee: ${feeBps} bps (${Number(feeBps) / 100}%)\n`);
  } catch (error) {
    console.error(`❌ Failed to read SimpleSwap: ${error}\n`);
  }

  // LockVault verification
  console.log("=== LockVault Contract ===\n");
  const LockVault = await ethers.getContractFactory("LockVault");
  const lockVault = LockVault.attach(deployment.lockVault);

  try {
    const owner = await lockVault.owner();
    console.log(`✅ Contract deployed at: ${deployment.lockVault}`);
    console.log(`   Owner: ${owner}\n`);
  } catch (error) {
    console.error(`❌ Failed to read LockVault: ${error}\n`);
  }

  // Testing SimpleSwap (if test tokens available)
  console.log("=== Configuration Steps ===\n");
  console.log("Before using the contracts, you need to:");
  console.log("");
  console.log("1️⃣  For SimpleSwap:");
  console.log("   - Call setTokenConfig() to register ERC20 tokens");
  console.log("   - Call setRate() to set exchange rates between token pairs");
  console.log("");
  console.log("   Example (in Hardhat console):");
  console.log("   > const swap = await ethers.getContractAt('SimpleSwap', '" +
    deployment.simpleSwap +
    "')");
  console.log("   > await swap.setTokenConfig(USDC_ADDRESS, 6, true)");
  console.log("   > await swap.setTokenConfig(KII_ADDRESS, 18, true)");
  console.log("   > await swap.setRate(USDC_ADDRESS, KII_ADDRESS, ethers.parseUnits('0.55', 18))");
  console.log("");
  console.log("2️⃣  For LockVault:");
  console.log("   - Call setSupportedToken() to enable tokens for locking");
  console.log("   - Call setRewardRate() to set reward percentages");
  console.log("");
  console.log("   Example (in Hardhat console):");
  console.log("   > const vault = await ethers.getContractAt('LockVault', '" +
    deployment.lockVault +
    "')");
  console.log("   > await vault.setSupportedToken(KII_ADDRESS, true)");
  console.log("   > await vault.setRewardRate(30, 500) // 5% reward for 30 days");
  console.log("   > await vault.setRewardRate(90, 1500) // 15% reward for 90 days");
  console.log("");

  // Export contract addresses
  console.log("=== Environment Variables ===\n");
  console.log("Add these to your .env.local for frontend integration:\n");
  console.log("NEXT_PUBLIC_SIMPLE_SWAP_ADDRESS=" + deployment.simpleSwap);
  console.log("NEXT_PUBLIC_LOCK_VAULT_ADDRESS=" + deployment.lockVault);
  console.log("");

  // ABI export status
  const abiDir = path.resolve(__dirname, "../abis");
  if (fs.existsSync(path.join(abiDir, "SimpleSwap.json"))) {
    console.log("✅ ABIs exported to abis/ directory\n");
  } else {
    console.log("⚠️  Run 'npm run export-abis' to generate ABI files\n");
  }

  console.log("✅ Verification complete!\n");
}

main().catch((error) => {
  console.error("❌ Verification failed:", error);
  process.exitCode = 1;
});
