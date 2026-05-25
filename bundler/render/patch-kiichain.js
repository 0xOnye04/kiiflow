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
