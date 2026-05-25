import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/types";

dotenv.config();

const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY || "";
const kiiChainTestnetChainId = 1336;
const defaultRpc = "https://json-rpc.uno.sentry.testnet.v3.kiivalidator.com/";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    hardhat: {},
    kiiChainTestnet: {
      url: process.env.KII_RPC_URL || defaultRpc,
      chainId: kiiChainTestnetChainId,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : []
    }
  },
  paths: {
    sources: "contracts",
    tests: "test",
    cache: "node_modules/.cache/hardhat",
    artifacts: "artifacts"
  }
};

export default config;
