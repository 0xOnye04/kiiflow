import fs from "fs";
import path from "path";
import hre from "hardhat";

const { ethers, network } = hre;

async function requireCode(label: string, address: string) {
  const code = await ethers.provider.getCode(address);
  if (!code || code === "0x") {
    throw new Error(`${label} has no deployed bytecode at ${address}`);
  }
}

async function main() {
  if (network.name !== "kiiChainTestnet") {
    throw new Error("Use --network kiiChainTestnet");
  }

  const entryPoint = process.env.ENTRY_POINT_ADDRESS;
  if (!entryPoint || !ethers.isAddress(entryPoint)) {
    throw new Error("ENTRY_POINT_ADDRESS is required");
  }
  await requireCode("EntryPoint", entryPoint);

  const [deployer] = await ethers.getSigners();
  console.log("Deploying account factory with:", deployer.address);

  const Factory = await ethers.getContractFactory("Simple4337AccountFactory");
  const factory = await Factory.deploy(entryPoint);
  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  const deploymentTx = factory.deploymentTransaction();

  const output = {
    network: network.name,
    chainId: 1336,
    deployer: deployer.address,
    entryPoint,
    accountFactory: factoryAddress,
    txHash: deploymentTx?.hash ?? "",
    timestamp: new Date().toISOString()
  };

  const deploymentsPath = path.resolve(process.cwd(), "deployments");
  fs.mkdirSync(deploymentsPath, { recursive: true });
  fs.writeFileSync(path.join(deploymentsPath, "kiiChainTestnet.accountFactory.json"), JSON.stringify(output, null, 2));

  console.log("Simple4337AccountFactory:", factoryAddress);
  console.log("Deployment metadata written to deployments/kiiChainTestnet.accountFactory.json");
  console.log(`Set NEXT_PUBLIC_ACCOUNT_FACTORY_ADDRESS=${factoryAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
