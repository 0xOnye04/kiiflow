import { ethers } from "ethers";
import { ERC20_ABI, Erc20Token, formatTokenAmount } from "./chain-transactions";
import {
  PaymasterFeeMode,
  PackedUserOperation,
  buildEntryPointUserOperation,
  encodePaymasterAndData,
  estimateNativeMaxCost,
  packUint128Pair,
  unpackAccountGasLimits,
  unpackGasFees,
  withUserOperationSignature
} from "./paymaster-sdk";

export const ENTRY_POINT_ADDRESS = process.env.NEXT_PUBLIC_ENTRY_POINT_ADDRESS || "";
export const PAYMASTER_ADDRESS = process.env.NEXT_PUBLIC_PAYMASTER_ADDRESS || "";
export const TREASURY_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_TREASURY_MANAGER_ADDRESS || "";
export const ACCOUNT_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_ACCOUNT_FACTORY_ADDRESS || "";
export const BUNDLER_RPC_URL = process.env.NEXT_PUBLIC_BUNDLER_RPC_URL || "";

const ACCOUNT_FACTORY_ABI = [
  "function createAccount(address owner,bytes32 salt) returns (address)",
  "function getAddress(address owner,bytes32 salt) view returns (address)"
];

const ACCOUNT_ABI = [
  "function execute(address target,uint256 value,bytes data)",
  "function executeBatch(tuple(address target,uint256 value,bytes data)[] calls)"
];

const DEFAULT_VERIFICATION_GAS = BigInt(3_000_000);
const DEFAULT_CALL_GAS = BigInt(220_000);
const DEFAULT_PRE_VERIFICATION_GAS = BigInt(120_000);
const DEFAULT_PAYMASTER_VERIFICATION_GAS = BigInt(300_000);
const DEFAULT_PAYMASTER_POST_OP_GAS = BigInt(180_000);

export type UserOperationReceipt = {
  userOpHash: string;
  receipt?: {
    transactionHash?: string;
    status?: string | number;
  };
  success?: boolean;
};

export function isAccountAbstractionConfigured() {
  return (
    ethers.isAddress(ENTRY_POINT_ADDRESS) &&
    ethers.isAddress(PAYMASTER_ADDRESS) &&
    ethers.isAddress(TREASURY_MANAGER_ADDRESS) &&
    ethers.isAddress(ACCOUNT_FACTORY_ADDRESS) &&
    BUNDLER_RPC_URL.startsWith("http")
  );
}

export function getAccountSalt(owner: string) {
  return ethers.keccak256(ethers.solidityPacked(["string", "address"], ["KiiFlow.account.v1", owner]));
}

export async function getSmartAccountAddress(owner: string, provider: ethers.Provider) {
  if (!ethers.isAddress(ACCOUNT_FACTORY_ADDRESS)) {
    throw new Error("Account factory is not configured.");
  }

  const factory = new ethers.Contract(ACCOUNT_FACTORY_ADDRESS, ACCOUNT_FACTORY_ABI, provider);
  return (await factory["getAddress(address,bytes32)"](owner, getAccountSalt(owner))) as string;
}

export async function getAccountInitCode(owner: string, provider: ethers.Provider) {
  const smartAccount = await getSmartAccountAddress(owner, provider);
  const code = await provider.getCode(smartAccount);

  if (code && code !== "0x") {
    return { smartAccount, initCode: "0x" };
  }

  const factoryInterface = new ethers.Interface(ACCOUNT_FACTORY_ABI);
  const factoryData = factoryInterface.encodeFunctionData("createAccount", [owner, getAccountSalt(owner)]);

  return {
    smartAccount,
    initCode: ethers.concat([ACCOUNT_FACTORY_ADDRESS, factoryData])
  };
}

export async function ensureSmartAccountDeployed(owner: string, signer: ethers.Signer) {
  if (!signer.provider) {
    throw new Error("Wallet provider unavailable.");
  }

  const smartAccount = await getSmartAccountAddress(owner, signer.provider);
  const code = await signer.provider.getCode(smartAccount);

  if (code && code !== "0x") {
    return { smartAccount, txHash: "" };
  }

  const factory = new ethers.Contract(ACCOUNT_FACTORY_ADDRESS, ACCOUNT_FACTORY_ABI, signer);
  const tx = await factory.createAccount(owner, getAccountSalt(owner));
  await tx.wait();

  return { smartAccount, txHash: tx.hash as string };
}

export async function getSmartAccountTokenState({
  provider,
  account,
  feeToken
}: {
  provider: ethers.Provider;
  account: string;
  feeToken: Erc20Token;
}) {
  const contract = new ethers.Contract(feeToken.address, ERC20_ABI, provider);
  const [balance, allowance] = await Promise.all([
    contract.balanceOf(account) as Promise<bigint>,
    contract.allowance(account, TREASURY_MANAGER_ADDRESS) as Promise<bigint>
  ]);

  return {
    balance,
    allowance,
    balanceLabel: formatTokenAmount(balance, feeToken.decimals, 6),
    allowanceLabel: formatTokenAmount(allowance, feeToken.decimals, 6)
  };
}

export async function resolveUserOpGas(provider: ethers.Provider) {
  const gasPrice = await provider
    .getFeeData()
    .then((fee) => fee.maxFeePerGas ?? fee.gasPrice ?? BigInt(1_000_000_000))
    .catch(() => BigInt(1_000_000_000));

  return {
    callGasLimit: DEFAULT_CALL_GAS,
    verificationGasLimit: DEFAULT_VERIFICATION_GAS,
    preVerificationGas: DEFAULT_PRE_VERIFICATION_GAS,
    paymasterVerificationGasLimit: DEFAULT_PAYMASTER_VERIFICATION_GAS,
    paymasterPostOpGasLimit: DEFAULT_PAYMASTER_POST_OP_GAS,
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: gasPrice
  };
}

function toRpcUserOperation(op: PackedUserOperation) {
  const { verificationGasLimit, callGasLimit } = unpackAccountGasLimits(op.accountGasLimits);
  const { maxPriorityFeePerGas, maxFeePerGas } = unpackGasFees(op.gasFees);
  const rpcOp: Record<string, string> = {
    sender: op.sender,
    nonce: ethers.toBeHex(op.nonce),
    callData: op.callData,
    callGasLimit: ethers.toBeHex(callGasLimit),
    verificationGasLimit: ethers.toBeHex(verificationGasLimit),
    preVerificationGas: ethers.toBeHex(op.preVerificationGas),
    maxFeePerGas: ethers.toBeHex(maxFeePerGas),
    maxPriorityFeePerGas: ethers.toBeHex(maxPriorityFeePerGas),
    signature: op.signature
  };

  if (op.initCode && op.initCode !== "0x") {
    rpcOp.factory = ethers.getAddress(`0x${op.initCode.slice(2, 42)}`);
    rpcOp.factoryData = `0x${op.initCode.slice(42)}`;
  }

  if (op.paymasterAndData && op.paymasterAndData !== "0x") {
    rpcOp.paymaster = ethers.getAddress(`0x${op.paymasterAndData.slice(2, 42)}`);
    rpcOp.paymasterVerificationGasLimit = ethers.toBeHex(BigInt(`0x${op.paymasterAndData.slice(42, 74)}`));
    rpcOp.paymasterPostOpGasLimit = ethers.toBeHex(BigInt(`0x${op.paymasterAndData.slice(74, 106)}`));
    rpcOp.paymasterData = `0x${op.paymasterAndData.slice(106)}`;
  }

  return rpcOp;
}

export async function bundlerRpc(method: string, params: unknown[]) {
  if (!BUNDLER_RPC_URL) {
    throw new Error("Bundler RPC URL is not configured.");
  }

  const response = await fetch(BUNDLER_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params })
  });

  const payload = await response.json();
  if (!response.ok || payload.error) {
    const message = payload.error?.message ?? `Bundler RPC ${method} failed with HTTP ${response.status}`;
    const details = payload.error?.data ? ` ${typeof payload.error.data === "string" ? payload.error.data : JSON.stringify(payload.error.data)}` : "";
    throw new Error(`${message}${details}`);
  }

  return payload.result;
}

export async function sendUserOperation(op: PackedUserOperation) {
  return bundlerRpc("eth_sendUserOperation", [toRpcUserOperation(op), ENTRY_POINT_ADDRESS]) as Promise<string>;
}

export async function getUserOperationReceipt(userOpHash: string) {
  return bundlerRpc("eth_getUserOperationReceipt", [userOpHash]) as Promise<UserOperationReceipt | null>;
}

export async function waitForUserOperationReceipt(userOpHash: string, timeoutMs = 120_000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const receipt = await getUserOperationReceipt(userOpHash);
    if (receipt) {
      return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }

  throw new Error("Timed out waiting for UserOperation receipt.");
}

export async function buildSignedUserOperation({
  owner,
  provider,
  target,
  data,
  value = BigInt(0),
  feeToken,
  mode,
  maxFeeToken,
  initCode,
  smartAccount
}: {
  owner: ethers.Signer;
  provider: ethers.Provider;
  target: string;
  data: string;
  value?: bigint;
  feeToken: Erc20Token;
  mode: PaymasterFeeMode;
  maxFeeToken?: bigint;
  initCode?: string;
  smartAccount?: string;
}) {
  const ownerAddress = await owner.getAddress();
  const accountInfo = smartAccount && initCode != null
    ? { smartAccount, initCode }
    : await getAccountInitCode(ownerAddress, provider);
  const gas = await resolveUserOpGas(provider);
  const accountInterface = new ethers.Interface(ACCOUNT_ABI);
  const callData = accountInterface.encodeFunctionData("execute", [target, value, data]);

  const unsigned = await buildEntryPointUserOperation({
    account: accountInfo.smartAccount,
    target,
    data,
    value,
    feeToken: feeToken.address,
    entryPoint: ENTRY_POINT_ADDRESS,
    paymaster: PAYMASTER_ADDRESS,
    provider,
    mode,
    ...gas
  });

  const nativeMaxCost = estimateNativeMaxCost(gas);
  const fallbackMaxFeeToken = maxFeeToken ?? ethers.parseUnits("5", feeToken.decimals);

  unsigned.initCode = accountInfo.initCode;
  unsigned.callData = callData;
  unsigned.accountGasLimits = packUint128Pair(gas.verificationGasLimit, gas.callGasLimit);
  unsigned.gasFees = packUint128Pair(gas.maxPriorityFeePerGas, gas.maxFeePerGas);
  unsigned.paymasterAndData = encodePaymasterAndData(PAYMASTER_ADDRESS, {
    feeToken: feeToken.address,
    maxFeeToken: mode === PaymasterFeeMode.TokenPay ? fallbackMaxFeeToken : BigInt(0),
    validUntil: Math.floor(Date.now() / 1000) + 600,
    validAfter: 0,
    mode,
    paymasterVerificationGasLimit: gas.paymasterVerificationGasLimit,
    paymasterPostOpGasLimit: gas.paymasterPostOpGasLimit
  });

  return {
    op: await withUserOperationSignature({ entryPoint: ENTRY_POINT_ADDRESS, op: unsigned, owner }),
    smartAccount: accountInfo.smartAccount,
    nativeMaxCost
  };
}

export async function buildSponsoredApprovalUserOperation({
  owner,
  provider,
  feeToken,
  approvalAmount = ethers.MaxUint256
}: {
  owner: ethers.Signer;
  provider: ethers.Provider;
  feeToken: Erc20Token;
  approvalAmount?: bigint;
}) {
  const tokenInterface = new ethers.Interface(ERC20_ABI);
  const data = tokenInterface.encodeFunctionData("approve", [TREASURY_MANAGER_ADDRESS, approvalAmount]);
  return buildSignedUserOperation({
    owner,
    provider,
    target: feeToken.address,
    data,
    feeToken,
    mode: PaymasterFeeMode.Sponsor
  });
}

export async function buildStablecoinTransferUserOperation({
  owner,
  provider,
  token,
  feeToken,
  recipient,
  amount
}: {
  owner: ethers.Signer;
  provider: ethers.Provider;
  token: Erc20Token;
  feeToken: Erc20Token;
  recipient: string;
  amount: bigint;
}) {
  const tokenInterface = new ethers.Interface(ERC20_ABI);
  const data = tokenInterface.encodeFunctionData("transfer", [recipient, amount]);
  return buildSignedUserOperation({
    owner,
    provider,
    target: token.address,
    data,
    feeToken,
    mode: PaymasterFeeMode.TokenPay,
    maxFeeToken: ethers.parseUnits("5", feeToken.decimals)
  });
}
