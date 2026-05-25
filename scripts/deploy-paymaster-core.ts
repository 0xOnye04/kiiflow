import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import hre from "hardhat";

dotenv.config();

const { ethers, network } = hre;

const KII_CHAIN_ID = 1336;

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

async function requireContractCode(name: string, address: string) {
  if (!ethers.isAddress(address)) {
    throw new Error(`${name} is not a valid address: ${address}`);
  }

  const code = await ethers.provider.getCode(address);
  if (!code || code === "0x") {
    throw new Error(`${name} has no deployed bytecode at ${address}`);
  }
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
}

async function main() {
  if (network.name !== "kiiChainTestnet") {
    throw new Error("Use --network kiiChainTestnet for real paymaster deployment");
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer found. Set DEPLOYER_PRIVATE_KEY in .env");
  }

  const entryPointAddress = process.env.ENTRY_POINT_ADDRESS;
  if (!entryPointAddress) {
    throw new Error("ENTRY_POINT_ADDRESS is required");
  }

  const bundlerRpcUrl = process.env.BUNDLER_RPC_URL;
  if (!bundlerRpcUrl) {
    throw new Error("BUNDLER_RPC_URL is required");
  }

  await requireContractCode("EntryPoint", entryPointAddress);
  await validateBundler(bundlerRpcUrl, entryPointAddress);

  console.log("Deploying KiiFlow paymaster core with:", deployer.address);
  console.log("EntryPoint:", entryPointAddress);
  console.log("Bundler:", bundlerRpcUrl);

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
    entryPointAddress,
    deployer.address,
    process.env.SETTLEMENT_OPERATOR_ADDRESS || deployer.address
  );
  await treasuryManager.waitForDeployment();
  console.log("TreasuryManager:", await treasuryManager.getAddress());

  const StablecoinPaymaster = await ethers.getContractFactory("StablecoinPaymaster");
  const paymaster = await StablecoinPaymaster.deploy(
    entryPointAddress,
    await tokenWhitelist.getAddress(),
    await oracleManager.getAddress(),
    await treasuryManager.getAddress()
  );
  await paymaster.waitForDeployment();
  console.log("StablecoinPaymaster:", await paymaster.getAddress());

  const setPaymasterTx = await treasuryManager.setPaymaster(await paymaster.getAddress());
  await setPaymasterTx.wait();

  const depositAmount = ethers.parseEther(process.env.PAYMASTER_DEPOSIT_KII || "0");
  let depositTx = "";
  if (depositAmount > BigInt(0)) {
    const tx = await paymaster.deposit({ value: depositAmount });
    await tx.wait();
    depositTx = tx.hash;
    console.log("Paymaster EntryPoint deposit:", ethers.formatEther(depositAmount), "KII");
  }

  const chain = await ethers.provider.getNetwork();
  const output = {
    network: network.name,
    chainId: Number(chain.chainId),
    deployer: deployer.address,
    entryPoint: entryPointAddress,
    bundlerRpcUrl,
    tokenWhitelist: await tokenWhitelist.getAddress(),
    oracleManager: await oracleManager.getAddress(),
    treasuryManager: await treasuryManager.getAddress(),
    stablecoinPaymaster: await paymaster.getAddress(),
    paymasterDepositTx: depositTx,
    configuredFeeTokens: [],
    note: "Paymaster core deployed with empty stablecoin whitelist. Configure real USDC/USDT later.",
    timestamp: new Date().toISOString()
  };

  const deploymentsPath = path.resolve(process.cwd(), "deployments");
  fs.mkdirSync(deploymentsPath, { recursive: true });
  fs.writeFileSync(path.join(deploymentsPath, "kiiChainTestnet.paymaster.json"), JSON.stringify(output, null, 2));

  console.log("Deployment metadata written to deployments/kiiChainTestnet.paymaster.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
