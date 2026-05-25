import fs from "fs";
import path from "path";

function copyAbi(contractName: string) {
  const artifactPath = path.resolve(__dirname, `../artifacts/contracts/${contractName}.sol/${contractName}.json`);
  const targetDir = path.resolve(__dirname, "../abis");
  const targetPath = path.join(targetDir, `${contractName}.json`);

  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found for ${contractName}. Compile your contracts first.`);
  }

  const artifactJson = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify({ abi: artifactJson.abi }, null, 2));
  console.log(`ABI exported to ${targetPath}`);
}

async function main() {
  copyAbi("SimpleSwap");
  copyAbi("LockVault");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
