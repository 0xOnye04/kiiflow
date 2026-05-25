import fs from "fs";
import path from "path";
import hre from "hardhat";

const { ethers, network } = hre;

const KII_DEX_TOKENS = [
  {
    symbol: "WKII",
    address: "0xd51e7187e54a4A22D790f8bbDdd9B54b891Bc920"
  },
  {
    symbol: "USDC",
    address: "0xb72FfA8E8079365c1890948464B542E42EEC892B"
  },
  {
    symbol: "USDT",
    address: "0x1A9992f48dE81C57D38147F3c573E84575021de6"
  }
];

const REWARD_RATES = [
  { lockDays: 30, rewardBps: 240 },
  { lockDays: 90, rewardBps: 760 },
  { lockDays: 180, rewardBps: 1380 }
];

async function requireContractCode(label: string, address: string) {
  if (!ethers.isAddress(address)) {
    throw new Error(`${label} address is invalid: ${address}`);
  }

  const code = await ethers.provider.getCode(address);
  if (!code || code === "0x") {
    throw new Error(`${label} has no deployed bytecode at ${address}`);
  }
}

async function main() {
  if (network.name !== "kiiChainTestnet") {
    throw new Error("Use --network kiiChainTestnet");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deploying LockVault with:", deployer.address);

  for (const token of KII_DEX_TOKENS) {
    await requireContractCode(token.symbol, token.address);
  }

  const LockVault = await ethers.getContractFactory("LockVault");
  const lockVault = await LockVault.deploy();
  await lockVault.waitForDeployment();

  const lockVaultAddress = await lockVault.getAddress();
  console.log("LockVault:", lockVaultAddress);

  const configuredTokens = [];
  for (const token of KII_DEX_TOKENS) {
    const tx = await lockVault.setSupportedToken(token.address, true);
    const receipt = await tx.wait();
    configuredTokens.push({ ...token, txHash: receipt?.hash ?? tx.hash });
    console.log(`Enabled ${token.symbol}:`, token.address);
  }

  const configuredRates = [];
  for (const rate of REWARD_RATES) {
    const tx = await lockVault.setRewardRate(rate.lockDays, rate.rewardBps);
    const receipt = await tx.wait();
    configuredRates.push({ ...rate, txHash: receipt?.hash ?? tx.hash });
    console.log(`Reward ${rate.lockDays} days:`, `${rate.rewardBps / 100}%`);
  }

  const output = {
    network: network.name,
    chainId: 1336,
    deployer: deployer.address,
    lockVault: lockVaultAddress,
    supportedTokens: configuredTokens,
    rewardRates: configuredRates,
    timestamp: new Date().toISOString()
  };

  const deploymentsPath = path.resolve(process.cwd(), "deployments");
  fs.mkdirSync(deploymentsPath, { recursive: true });
  fs.writeFileSync(path.join(deploymentsPath, "kiiChainTestnet.lockVault.json"), JSON.stringify(output, null, 2));

  console.log("Deployment metadata written to deployments/kiiChainTestnet.lockVault.json");
  console.log(`Set NEXT_PUBLIC_LOCK_VAULT_ADDRESS=${lockVaultAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
