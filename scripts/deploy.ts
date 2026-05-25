import fs from "fs";
import path from "path";
import hre from "hardhat";

const { ethers, network } = hre;

const KII_CHAIN_ID = 1336;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const PLACEHOLDER_PATTERNS = ["your", "placeholder", "real", "0xusdc", "0xusdt", "0xentry", "0xrouter"];

function parseAddressList(value?: string) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseUnitsEnv(name: string, decimals: number, fallback: string) {
  return ethers.parseUnits(process.env[name] ?? fallback, decimals);
}

function requireRealAddress(name: string, value?: string) {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  const normalized = value.trim();
  const lower = normalized.toLowerCase();

  if (!ethers.isAddress(normalized) || lower === ZERO_ADDRESS || PLACEHOLDER_PATTERNS.some((item) => lower.includes(item))) {
    throw new Error(`${name} must be a real deployed address, got: ${value}`);
  }

  return ethers.getAddress(normalized);
}

async function requireContractCode(name: string, address: string) {
  const code = await ethers.provider.getCode(address);
  if (!code || code === "0x") {
    throw new Error(`${name} has no deployed bytecode at ${address}`);
  }
}

async function validateErc20Token(label: "USDC" | "USDT", value?: string) {
  const address = requireRealAddress(`${label}_ADDRESS`, value);
  await requireContractCode(label, address);

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

  const [symbol, name, decimals, totalSupply] = await Promise.all([
    erc20.symbol(),
    erc20.name(),
    erc20.decimals(),
    erc20.totalSupply()
  ]);

  const symbolText = String(symbol).toUpperCase();
  if (!symbolText.includes(label)) {
    throw new Error(`${label}_ADDRESS metadata mismatch: symbol is ${symbol}`);
  }

  if (Number(decimals) > 18) {
    throw new Error(`${label}_ADDRESS has invalid decimals: ${decimals}`);
  }

  if (BigInt(totalSupply) <= BigInt(0)) {
    throw new Error(`${label}_ADDRESS totalSupply is zero`);
  }

  console.log(`Validated real ${label}:`, address, `(${name}, ${symbol}, ${decimals} decimals)`);
  return { address, symbol: label, decimals: Number(decimals) };
}

async function rpcCall(url: string, method: string, params: unknown[] = []) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params })
  });

  if (!response.ok) {
    throw new Error(`${method} failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(`${method} failed: ${payload.error.message ?? JSON.stringify(payload.error)}`);
  }

  return payload.result;
}

async function validateBundler(bundlerRpcUrl: string, entryPointAddress: string) {
  const chainId = Number(BigInt(await rpcCall(bundlerRpcUrl, "eth_chainId")));
  if (chainId !== KII_CHAIN_ID) {
    throw new Error(`Bundler chainId mismatch: expected ${KII_CHAIN_ID}, got ${chainId}`);
  }

  const entryPoints = (await rpcCall(bundlerRpcUrl, "eth_supportedEntryPoints")) as string[];
  const supportsEntryPoint = entryPoints.some((item) => item.toLowerCase() === entryPointAddress.toLowerCase());
  if (!supportsEntryPoint) {
    throw new Error(`Bundler does not support EntryPoint ${entryPointAddress}`);
  }

  console.log("Validated bundler RPC:", bundlerRpcUrl);
}

async function resolveEntryPoint() {
  const configured = process.env.ENTRY_POINT_ADDRESS;

  if (configured) {
    const address = requireRealAddress("ENTRY_POINT_ADDRESS", configured);
    await requireContractCode("EntryPoint", address);
    return { address, deployedNow: false, txHash: "" };
  }

  if (network.name === "kiiChainTestnet" && process.env.DEPLOY_ENTRYPOINT !== "true") {
    throw new Error("ENTRY_POINT_ADDRESS is required unless DEPLOY_ENTRYPOINT=true");
  }

  const EntryPoint = await ethers.getContractFactory("OfficialEntryPoint");
  const entryPoint = await EntryPoint.deploy();
  await entryPoint.waitForDeployment();
  const deployTx = entryPoint.deploymentTransaction();
  return { address: await entryPoint.getAddress(), deployedNow: true, txHash: deployTx?.hash ?? "" };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying KiiFlow with account:", deployer.address);
  console.log("Network:", network.name);
  const isKiiTestnet = network.name === "kiiChainTestnet";

  const configuredStablecoins = [process.env.USDC_ADDRESS, process.env.USDT_ADDRESS].filter(Boolean);
  if (isKiiTestnet && configuredStablecoins.length === 0) {
    throw new Error("no native stablecoin deployment available on chain");
  }

  const stablecoins = [];
  if (process.env.USDC_ADDRESS) {
    stablecoins.push(await validateErc20Token("USDC", process.env.USDC_ADDRESS));
  }
  if (process.env.USDT_ADDRESS) {
    stablecoins.push(await validateErc20Token("USDT", process.env.USDT_ADDRESS));
  }

  const entryPoint = await resolveEntryPoint();
  console.log(entryPoint.deployedNow ? "Deployed EntryPoint:" : "EntryPoint:", entryPoint.address);
  if (entryPoint.txHash) {
    console.log("EntryPoint tx:", entryPoint.txHash);
  }

  const bundlerRpcUrl = process.env.BUNDLER_RPC_URL || "";
  if (isKiiTestnet) {
    if (!bundlerRpcUrl || PLACEHOLDER_PATTERNS.some((item) => bundlerRpcUrl.toLowerCase().includes(item))) {
      throw new Error("BUNDLER_RPC_URL must be a real ERC-4337 bundler endpoint");
    }
    await validateBundler(bundlerRpcUrl, entryPoint.address);
  }

  const SimpleSwap = await ethers.getContractFactory("SimpleSwap");
  const simpleSwap = await SimpleSwap.deploy(30);
  await simpleSwap.waitForDeployment();
  console.log("SimpleSwap:", await simpleSwap.getAddress());

  const LockVault = await ethers.getContractFactory("LockVault");
  const lockVault = await LockVault.deploy();
  await lockVault.waitForDeployment();
  console.log("LockVault:", await lockVault.getAddress());

  const TokenWhitelist = await ethers.getContractFactory("TokenWhitelist");
  const tokenWhitelist = await TokenWhitelist.deploy(deployer.address);
  await tokenWhitelist.waitForDeployment();
  console.log("TokenWhitelist:", await tokenWhitelist.getAddress());

  const OracleManager = await ethers.getContractFactory("OracleManager");
  const oracleManager = await OracleManager.deploy(deployer.address);
  await oracleManager.waitForDeployment();
  console.log("OracleManager:", await oracleManager.getAddress());

  const TreasuryManager = await ethers.getContractFactory("TreasuryManager");
  const treasuryManager = await TreasuryManager.deploy(
    entryPoint.address,
    deployer.address,
    process.env.SETTLEMENT_OPERATOR_ADDRESS || deployer.address
  );
  await treasuryManager.waitForDeployment();
  console.log("TreasuryManager:", await treasuryManager.getAddress());

  const StablecoinPaymaster = await ethers.getContractFactory("StablecoinPaymaster");
  const stablecoinPaymaster = await StablecoinPaymaster.deploy(
    entryPoint.address,
    await tokenWhitelist.getAddress(),
    await oracleManager.getAddress(),
    await treasuryManager.getAddress()
  );
  await stablecoinPaymaster.waitForDeployment();
  console.log("StablecoinPaymaster:", await stablecoinPaymaster.getAddress());

  await treasuryManager.setPaymaster(await stablecoinPaymaster.getAddress());

  const feeTokens = parseAddressList(stablecoins.map((item) => item.address).join(","));

  for (const token of stablecoins) {
    const maxFeePerOp = parseUnitsEnv(`${token.symbol}_MAX_FEE_PER_OP`, token.decimals, "5");
    const tokenPerKii = parseUnitsEnv(`${token.symbol}_TOKEN_PER_KII`, token.decimals, "1");
    const maxStaleness = Number(process.env[`${token.symbol}_PRICE_MAX_STALENESS`] ?? 3600);
    const slippageBps = Number(process.env[`${token.symbol}_MAX_SLIPPAGE_BPS`] ?? 500);

    await tokenWhitelist.setToken(token.address, token.decimals, maxFeePerOp, slippageBps, true);
    await oracleManager.setTokenPrice(token.address, tokenPerKii, maxStaleness, true);
    console.log(`Configured ${token.symbol}:`, token.address);
  }

  const paymasterDeposit = ethers.parseEther(process.env.PAYMASTER_DEPOSIT_KII ?? "0");
  if (paymasterDeposit > BigInt(0)) {
    await stablecoinPaymaster.deposit({ value: paymasterDeposit });
    console.log("Paymaster EntryPoint deposit:", ethers.formatEther(paymasterDeposit), "KII");
  }

  let settlementRouter = process.env.SETTLEMENT_ROUTER_ADDRESS || "";
  if (settlementRouter) {
    settlementRouter = requireRealAddress("SETTLEMENT_ROUTER_ADDRESS", settlementRouter);
    await requireContractCode("Settlement router", settlementRouter);
    console.log("Settlement router:", settlementRouter);
  } else if (isKiiTestnet) {
    console.log("Settlement router disabled: no verified KiiChain DEX/router configured");
  } else if (network.name === "hardhat" || network.name === "localhost") {
    const MockKiiSettlementRouter = await ethers.getContractFactory("MockKiiSettlementRouter");
    const mockRouter = await MockKiiSettlementRouter.deploy(deployer.address);
    await mockRouter.waitForDeployment();
    settlementRouter = await mockRouter.getAddress();
    console.log("Local MockKiiSettlementRouter:", settlementRouter);
  }

  const output = {
    network: network.name,
    chainId: network.name === "kiiChainTestnet" ? 1336 : Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    entryPoint: entryPoint.address,
    entryPointDeploymentTx: entryPoint.txHash,
    bundlerRpcUrl,
    simpleSwap: await simpleSwap.getAddress(),
    lockVault: await lockVault.getAddress(),
    tokenWhitelist: await tokenWhitelist.getAddress(),
    oracleManager: await oracleManager.getAddress(),
    treasuryManager: await treasuryManager.getAddress(),
    stablecoinPaymaster: await stablecoinPaymaster.getAddress(),
    settlementRouter,
    feeTokens: stablecoins,
    timestamp: new Date().toISOString()
  };

  const deploymentsPath = path.resolve(process.cwd(), "deployments");
  fs.mkdirSync(deploymentsPath, { recursive: true });
  fs.writeFileSync(path.join(deploymentsPath, `${network.name}.json`), JSON.stringify(output, null, 2));

  console.log(`Deployment metadata written to deployments/${network.name}.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
