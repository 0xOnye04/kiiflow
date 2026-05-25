import fs from "fs";
import path from "path";
import hre from "hardhat";

const { ethers, network } = hre;

async function main() {
  if (network.name !== "kiiChainTestnet") {
    throw new Error("Use --network kiiChainTestnet for real EntryPoint deployment");
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer found. Set DEPLOYER_PRIVATE_KEY in .env");
  }

  console.log("Deploying official ERC-4337 EntryPoint with:", deployer.address);

  const EntryPoint = await ethers.getContractFactory("OfficialEntryPoint");
  const entryPoint = await EntryPoint.deploy();
  await entryPoint.waitForDeployment();

  const address = await entryPoint.getAddress();
  const txHash = entryPoint.deploymentTransaction()?.hash ?? "";
  const chain = await ethers.provider.getNetwork();

  const output = {
    network: network.name,
    chainId: Number(chain.chainId),
    deployer: deployer.address,
    entryPoint: address,
    entryPointDeploymentTx: txHash,
    timestamp: new Date().toISOString()
  };

  const deploymentsPath = path.resolve(process.cwd(), "deployments");
  fs.mkdirSync(deploymentsPath, { recursive: true });
  fs.writeFileSync(path.join(deploymentsPath, "kiiChainTestnet.entrypoint.json"), JSON.stringify(output, null, 2));

  console.log("EntryPoint:", address);
  console.log("EntryPoint tx:", txHash);
  console.log("Deployment metadata written to deployments/kiiChainTestnet.entrypoint.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
