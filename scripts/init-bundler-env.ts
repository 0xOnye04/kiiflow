import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

function loadEntryPoint() {
  if (process.env.ENTRY_POINT_ADDRESS) {
    return process.env.ENTRY_POINT_ADDRESS;
  }

  const deploymentPath = path.resolve(process.cwd(), "deployments/kiiChainTestnet.entrypoint.json");
  if (fs.existsSync(deploymentPath)) {
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    if (deployment.entryPoint) {
      return deployment.entryPoint;
    }
  }

  throw new Error("Missing ENTRY_POINT_ADDRESS and deployments/kiiChainTestnet.entrypoint.json");
}

function main() {
  const bundlerDir = path.resolve(process.cwd(), "bundler");
  const bundlerEnvPath = path.join(bundlerDir, ".env");

  if (fs.existsSync(bundlerEnvPath)) {
    throw new Error("bundler/.env already exists. Delete it first if you want to generate a new bundler wallet.");
  }

  fs.mkdirSync(bundlerDir, { recursive: true });

  const wallet = ethers.Wallet.createRandom();
  const entryPoint = loadEntryPoint();

  const contents = [
    "KII_RPC_URL=https://json-rpc.uno.sentry.testnet.v3.kiivalidator.com/",
    "BUNDLER_PORT=4337",
    "BUNDLER_MIN_BALANCE=0.01",
    `TRANSEPTOR_ENTRYPOINT_ADDRESS=${entryPoint}`,
    `TRANSEPTOR_BENEFICIARY=${wallet.address}`,
    `TRANSEPTOR_MNEMONIC=${wallet.mnemonic?.phrase}`,
    "TRANSEPTOR_LOG_LEVEL=info",
    ""
  ].join("\n");

  fs.writeFileSync(bundlerEnvPath, contents);

  console.log("Created bundler/.env");
  console.log("Bundler wallet address:", wallet.address);
  console.log("Fund this address with KiiChain testnet KII before starting the bundler.");
}

main();
