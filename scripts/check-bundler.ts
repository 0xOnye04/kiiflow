import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const bundlerEnvPath = path.resolve(process.cwd(), "bundler/.env");
if (fs.existsSync(bundlerEnvPath)) {
  dotenv.config({ path: bundlerEnvPath, override: false });
}

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

async function main() {
  const bundlerRpcUrl = process.env.BUNDLER_RPC_URL || `http://localhost:${process.env.BUNDLER_PORT || "4337"}/rpc`;
  const entryPoint = process.env.ENTRY_POINT_ADDRESS || process.env.TRANSEPTOR_ENTRYPOINT_ADDRESS;

  if (!entryPoint) {
    throw new Error("Missing ENTRY_POINT_ADDRESS or TRANSEPTOR_ENTRYPOINT_ADDRESS");
  }

  console.log("Checking bundler:", bundlerRpcUrl);

  const clientVersion = await rpcCall(bundlerRpcUrl, "web3_clientVersion");
  const chainId = Number(BigInt(await rpcCall(bundlerRpcUrl, "eth_chainId")));
  const supportedEntryPoints = (await rpcCall(bundlerRpcUrl, "eth_supportedEntryPoints")) as string[];

  if (chainId !== KII_CHAIN_ID) {
    throw new Error(`Bundler chainId mismatch: expected ${KII_CHAIN_ID}, got ${chainId}`);
  }

  const supportsEntryPoint = supportedEntryPoints.some((item) => item.toLowerCase() === entryPoint.toLowerCase());
  if (!supportsEntryPoint) {
    throw new Error(`Bundler does not support EntryPoint ${entryPoint}`);
  }

  console.log("Bundler client:", clientVersion);
  console.log("Bundler chainId:", chainId);
  console.log("Supported EntryPoints:", supportedEntryPoints.join(", "));
  console.log("BUNDLER_RPC_URL=", bundlerRpcUrl);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
