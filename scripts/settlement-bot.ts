import * as dotenv from "dotenv";
import { ethers } from "ethers";
import {
  convertStablecoinAndRefill,
  getSettlementState
} from "../lib/paymaster-sdk";

dotenv.config();

function required(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function parseTokenList(value?: string) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main() {
  const rpcUrl = required("KII_RPC_URL");
  const privateKey = required("SETTLEMENT_OPERATOR_PRIVATE_KEY");
  const paymasterAddress = required("PAYMASTER_ADDRESS");
  const treasuryManager = required("TREASURY_MANAGER_ADDRESS");
  const routerAddress = required("SETTLEMENT_ROUTER_ADDRESS");
  const feeTokens = parseTokenList(required("FEE_TOKEN_ADDRESSES"));
  const minKiiOut = ethers.parseEther(process.env.MIN_KII_OUT ?? "0");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const operator = new ethers.Wallet(privateKey, provider);

  const state = await getSettlementState({
    paymaster: paymasterAddress,
    treasuryManager,
    feeTokens,
    provider
  });

  console.log("Paymaster EntryPoint deposit:", ethers.formatEther(state.entryPointDeposit), "KII");
  console.log("Treasury manager:", treasuryManager);
  console.log("Settlement router:", routerAddress);

  for (const item of state.tokenBalances) {
    console.log("Collected fee token:", item.token, item.balance.toString());

    if (item.balance > BigInt(0)) {
      await convertStablecoinAndRefill({
        treasuryManager,
        router: routerAddress,
        token: item.token,
        amountIn: item.balance,
        minKiiOut,
        operator
      });
      console.log("Converted token to KII and refilled paymaster deposit:", item.token);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
