const fs = require("fs");

function patchFile(path, replacements) {
  let content = fs.readFileSync(path, "utf8");

  for (const [from, to] of replacements) {
    if (!content.includes(to)) {
      if (!content.includes(from)) {
        throw new Error(`Expected source text not found in ${path}`);
      }
      content = content.replace(from, to);
    }
  }

  fs.writeFileSync(path, content);
}

function patchFileRegex(path, replacements) {
  let content = fs.readFileSync(path, "utf8");

  for (const [from, to, alreadyPatchedText] of replacements) {
    if (!content.includes(alreadyPatchedText)) {
      if (!from.test(content)) {
        throw new Error(`Expected source pattern not found in ${path}`);
      }
      content = content.replace(from, to);
    }
  }

  fs.writeFileSync(path, content);
}

patchFile("src/gas/pre-verification-gas.ts", [
  [
    "    1337: MAINNET_CONFIG,\n    31337: MAINNET_CONFIG,",
    "    1337: MAINNET_CONFIG,\n    1336: MAINNET_CONFIG,\n    31337: MAINNET_CONFIG,"
  ]
]);

patchFile("src/provider/provider-service.ts", [
  [
    "return [1, 31337, 1337, 11155111]",
    "return [1, 31337, 1337, 1336, 11155111]"
  ]
]);

patchFileRegex("src/event/event-manager.ts", [
  [
    /    getUserOperationEvent: async \(\r?\n      userOpHash: string,\r?\n    \): Promise<ethers\.EventLog> => \{\r?\n      \/\/ TODO: eth_getLogs is throttled\. must be acceptable for finding a UserOperation by hash\r?\n      const events = await entryPointContract\.queryFilter\(\r?\n        entryPointContract\.filters\.UserOperationEvent\(userOpHash\),\r?\n      \)\r?\n\r?\n      if \(events\.length === 0 \|\| !events\[0\]\) \{\r?\n        return null\r?\n      \}/,
    `    getUserOperationEvent: async (
      userOpHash: string,
    ): Promise<ethers.EventLog> => {
      const latestBlock = await providerService.getBlockNumber()
      const configuredMaxBlockRange = Number(process.env.TRANSEPTOR_MAX_LOG_BLOCK_RANGE ?? 9000)
      const configuredLookbackBlocks = Number(process.env.TRANSEPTOR_RECEIPT_LOOKBACK_BLOCKS ?? 9000)
      const maxBlockRange = Number.isFinite(configuredMaxBlockRange) && configuredMaxBlockRange > 0 ? configuredMaxBlockRange : 9000
      const lookbackBlocks = Number.isFinite(configuredLookbackBlocks) && configuredLookbackBlocks > 0 ? configuredLookbackBlocks : 9000
      const fromBlock = Math.max(1, latestBlock - lookbackBlocks)
      const filter = entryPointContract.filters.UserOperationEvent(userOpHash)
      const events: (ethers.EventLog | Log)[] = []

      for (let start = fromBlock; start <= latestBlock; start += maxBlockRange) {
        const end = Math.min(latestBlock, start + maxBlockRange - 1)
        events.push(...(await entryPointContract.queryFilter(filter, start, end)))
      }

      if (events.length === 0 || !events[0]) {
        return null
      }`,
    "TRANSEPTOR_MAX_LOG_BLOCK_RANGE"
  ]
]);
