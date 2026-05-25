import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import hre from "hardhat";

dotenv.config();

const { ethers, network } = hre;

type TokenConfig = {
  symbol: "USDC" | "USDT";
  envName: "USDC_ADDRESS" | "USDT_ADDRESS";
};

const tokens: TokenConfig[] = [
  { symbol: "USDC", envName: "USDC_ADDRESS" },
  { symbol: "USDT", envName: "USDT_ADDRESS" }
];

async function validateToken(symbol: string, address: string) {
  const code = await ethers.provider.getCode(address);
  if (!code || code === "0x") {
    throw new Error(`${symbol} has no bytecode at ${address}`);
  }

  const erc20 = new ethers.Contract(
    address,
    [
      "function symbol() view returns (string)",
      "function name() view returns (string)",
      "function decimals() view returns (uint8)",
      "function totalSupply() view returns (uint256)"
    ],
    ethers.provider
  );

  const [name, tokenSymbol, decimals, totalSupply] = await Promise.all([
    erc20.name(),
    erc20.symbol(),
    erc20.decimals(),
    erc20.totalSupply()
  ]);

  if (String(tokenSymbol).toUpperCase() !== symbol) {
    throw new Error(`${symbol} metadata mismatch: got ${tokenSymbol}`);
  }

  if (BigInt(totalSupply) <= BigInt(0)) {
    throw new Error(`${symbol} totalSupply is zero`);
  }

  return { name, symbol: tokenSymbol, decimals: Number(decimals), totalSupply };
}

async function main() {
  if (network.name !== "kiiChainTestnet") {
    throw new Error("Use --network kiiChainTestnet");
  }

  const deploymentPath = path.resolve(process.cwd(), "deployments/kiiChainTestnet.paymaster.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Missing deployments/kiiChainTestnet.paymaster.json");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const tokenWhitelistAddress = deployment.tokenWhitelist;
  const oracleManagerAddress = deployment.oracleManager;

  if (!ethers.isAddress(tokenWhitelistAddress) || !ethers.isAddress(oracleManagerAddress)) {
    throw new Error("Deployment file is missing TokenWhitelist or OracleManager addresses");
  }

  const tokenWhitelist = await ethers.getContractAt("TokenWhitelist", tokenWhitelistAddress);
  const oracleManager = await ethers.getContractAt("OracleManager", oracleManagerAddress);

  const configured = [];

  for (const token of tokens) {
    const address = process.env[token.envName];
    if (!address) {
      continue;
    }

    if (!ethers.isAddress(address)) {
      throw new Error(`${token.envName} is not a valid address`);
    }

    const metadata = await validateToken(token.symbol, address);
    const maxFeePerOp = ethers.parseUnits(process.env[`${token.symbol}_MAX_FEE_PER_OP`] ?? "5", metadata.decimals);
    const tokenPerKii = ethers.parseUnits(process.env[`${token.symbol}_TOKEN_PER_KII`] ?? "1", metadata.decimals);
    const maxStaleness = Number(process.env[`${token.symbol}_PRICE_MAX_STALENESS`] ?? 3600);
    const slippageBps = Number(process.env[`${token.symbol}_MAX_SLIPPAGE_BPS`] ?? 500);

    const whitelistTx = await tokenWhitelist.setToken(address, metadata.decimals, maxFeePerOp, slippageBps, true);
    await whitelistTx.wait();

    const oracleTx = await oracleManager.setTokenPrice(address, tokenPerKii, maxStaleness, true);
    await oracleTx.wait();

    configured.push({
      symbol: token.symbol,
      name: metadata.name,
      address,
      decimals: metadata.decimals,
      maxFeePerOp: maxFeePerOp.toString(),
      tokenPerKii: tokenPerKii.toString(),
      maxStaleness,
      slippageBps,
      whitelistTx: whitelistTx.hash,
      oracleTx: oracleTx.hash
    });

    console.log(`Configured ${token.symbol}:`, address);
  }

  if (configured.length === 0) {
    throw new Error("No USDC_ADDRESS or USDT_ADDRESS configured");
  }

  deployment.configuredFeeTokens = configured;
  deployment.note = "Paymaster configured with real KiiDex testnet USDC/USDT fee tokens.";
  deployment.updatedAt = new Date().toISOString();
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log("Updated deployments/kiiChainTestnet.paymaster.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
