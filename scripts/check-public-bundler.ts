const bundlerRpcUrl = process.env.NEXT_PUBLIC_BUNDLER_RPC_URL || process.env.BUNDLER_RPC_URL;
const entryPointAddress =
  process.env.NEXT_PUBLIC_ENTRY_POINT_ADDRESS ||
  process.env.ENTRY_POINT_ADDRESS ||
  "0xC3412374BEf9Ea5De79022454c1802A5a58fB2B3";

async function rpcCall(method: string, params: unknown[] = []) {
  if (!bundlerRpcUrl) {
    throw new Error("Set NEXT_PUBLIC_BUNDLER_RPC_URL or BUNDLER_RPC_URL first.");
  }

  const response = await fetch(bundlerRpcUrl, {
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
  console.log("Checking bundler:", bundlerRpcUrl);

  const chainId = Number(BigInt(await rpcCall("eth_chainId")));
  if (chainId !== 1336) {
    throw new Error(`Bundler chainId mismatch: expected 1336, got ${chainId}`);
  }

  const entryPoints = (await rpcCall("eth_supportedEntryPoints")) as string[];
  const supportsEntryPoint = entryPoints.some((item) => item.toLowerCase() === entryPointAddress.toLowerCase());
  if (!supportsEntryPoint) {
    throw new Error(`Bundler does not support EntryPoint ${entryPointAddress}`);
  }

  console.log("Bundler OK");
  console.log("chainId:", chainId);
  console.log("entryPoint:", entryPointAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
