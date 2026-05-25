import { ethers } from "ethers";

export enum PaymasterFeeMode {
  Sponsor = 0,
  TokenPay = 1
}

export type PackedUserOperation = {
  sender: string;
  nonce: bigint;
  initCode: string;
  callData: string;
  accountGasLimits: string;
  preVerificationGas: bigint;
  gasFees: string;
  paymasterAndData: string;
  signature: string;
};

export type UserOperationGas = {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
};

export type PaymasterFeeData = {
  feeToken: string;
  maxFeeToken: bigint;
  validUntil: number;
  validAfter: number;
  mode: PaymasterFeeMode;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
};

export type FeeTokenQuote = {
  token: string;
  estimatedFee: bigint;
  available: boolean;
  reason: string;
};

const PACKED_USER_OPERATION =
  "tuple(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)";

const ENTRY_POINT_ABI = [
  `function getUserOpHash(${PACKED_USER_OPERATION} userOp) view returns (bytes32)`,
  `function handleOps(${PACKED_USER_OPERATION}[] ops,address payable beneficiary)`,
  "function getNonce(address sender,uint192 key) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)"
];

const PAYMASTER_ABI = [
  "function quoteTokenFee(address token,uint256 nativeWeiCost) view returns (uint256)",
  "function getDeposit() view returns (uint256)",
  "function deposit() payable",
  "function withdrawTo(address payable withdrawAddress,uint256 amount)",
  "function treasuryManager() view returns (address)",
  "function tokenWhitelist() view returns (address)",
  "function oracleManager() view returns (address)"
];

const TREASURY_MANAGER_ABI = [
  "function tokenBalance(address token) view returns (uint256)",
  "function convertAndRefill(address router,address token,uint256 amountIn,uint256 minKiiOut) returns (uint256)"
];

const ACCOUNT_ABI = [
  "function nonce() view returns (uint256)",
  "function execute(address target,uint256 value,bytes data)",
  "function executeBatch(tuple(address target,uint256 value,bytes data)[] calls)"
];

export function getEntryPointContract(address: string, runner: ethers.ContractRunner) {
  return new ethers.Contract(address, ENTRY_POINT_ABI, runner);
}

export function getPaymasterContract(address: string, runner: ethers.ContractRunner) {
  return new ethers.Contract(address, PAYMASTER_ABI, runner);
}

export function getAccountContract(address: string, runner: ethers.ContractRunner) {
  return new ethers.Contract(address, ACCOUNT_ABI, runner);
}

export function getTreasuryManagerContract(address: string, runner: ethers.ContractRunner) {
  return new ethers.Contract(address, TREASURY_MANAGER_ABI, runner);
}

export function packUint128Pair(high: bigint, low: bigint) {
  const maxUint128 = (BigInt(1) << BigInt(128)) - BigInt(1);
  if (high < BigInt(0) || low < BigInt(0) || high > maxUint128 || low > maxUint128) {
    throw new Error("Packed ERC-4337 gas values must fit uint128");
  }

  return ethers.toBeHex((high << BigInt(128)) | low, 32);
}

export function unpackAccountGasLimits(accountGasLimits: string) {
  const value = BigInt(accountGasLimits);
  const mask = (BigInt(1) << BigInt(128)) - BigInt(1);
  return {
    verificationGasLimit: value >> BigInt(128),
    callGasLimit: value & mask
  };
}

export function unpackGasFees(gasFees: string) {
  const value = BigInt(gasFees);
  const mask = (BigInt(1) << BigInt(128)) - BigInt(1);
  return {
    maxPriorityFeePerGas: value >> BigInt(128),
    maxFeePerGas: value & mask
  };
}

export function estimateNativeMaxCost(gas: UserOperationGas) {
  const paymasterVerificationGasLimit = gas.paymasterVerificationGasLimit ?? BigInt(120_000);
  const paymasterPostOpGasLimit = gas.paymasterPostOpGasLimit ?? BigInt(80_000);

  return (
    gas.callGasLimit +
    gas.verificationGasLimit +
    gas.preVerificationGas +
    paymasterVerificationGasLimit +
    paymasterPostOpGasLimit
  ) * gas.maxFeePerGas;
}

export function encodePaymasterAndData(paymaster: string, feeData: PaymasterFeeData) {
  return ethers.solidityPacked(
    ["address", "uint128", "uint128", "bytes"],
    [
      paymaster,
      feeData.paymasterVerificationGasLimit ?? BigInt(120_000),
      feeData.paymasterPostOpGasLimit ?? BigInt(80_000),
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint48", "uint48", "uint8"],
        [feeData.feeToken, feeData.maxFeeToken, feeData.validUntil, feeData.validAfter, feeData.mode]
      )
    ]
  );
}

export async function buildEntryPointUserOperation({
  account,
  target,
  data,
  feeToken,
  entryPoint,
  paymaster,
  provider,
  value = BigInt(0),
  callGasLimit = BigInt(180_000),
  verificationGasLimit = BigInt(180_000),
  preVerificationGas = BigInt(60_000),
  paymasterVerificationGasLimit = BigInt(120_000),
  paymasterPostOpGasLimit = BigInt(80_000),
  maxFeePerGas,
  maxPriorityFeePerGas,
  ttlSeconds = 600,
  feeBufferBps = 500,
  mode = PaymasterFeeMode.TokenPay
}: {
  account: string;
  target: string;
  data: string;
  feeToken: string;
  entryPoint: string;
  paymaster: string;
  provider: ethers.Provider;
  value?: bigint;
  callGasLimit?: bigint;
  verificationGasLimit?: bigint;
  preVerificationGas?: bigint;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  ttlSeconds?: number;
  feeBufferBps?: number;
  mode?: PaymasterFeeMode;
}): Promise<PackedUserOperation> {
  const accountContract = getAccountContract(account, provider);
  const paymasterContract = getPaymasterContract(paymaster, provider);
  const entryPointContract = getEntryPointContract(entryPoint, provider);

  const nonce = await entryPointContract.getNonce(account, 0);
  const gas = {
    callGasLimit,
    verificationGasLimit,
    preVerificationGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    paymasterVerificationGasLimit,
    paymasterPostOpGasLimit
  };

  const nativeMaxCost = estimateNativeMaxCost(gas);
  const estimatedFee =
    mode === PaymasterFeeMode.TokenPay ? await paymasterContract.quoteTokenFee(feeToken, nativeMaxCost) : BigInt(0);
  const maxFeeToken = estimatedFee + ((estimatedFee * BigInt(feeBufferBps)) / BigInt(10_000));
  const callData = accountContract.interface.encodeFunctionData("execute", [target, value, data]);

  return {
    sender: account,
    nonce,
    initCode: "0x",
    callData,
    accountGasLimits: packUint128Pair(verificationGasLimit, callGasLimit),
    preVerificationGas,
    gasFees: packUint128Pair(maxPriorityFeePerGas, maxFeePerGas),
    paymasterAndData: encodePaymasterAndData(paymaster, {
      feeToken,
      maxFeeToken,
      validUntil: Math.floor(Date.now() / 1000) + ttlSeconds,
      validAfter: 0,
      mode,
      paymasterVerificationGasLimit,
      paymasterPostOpGasLimit
    }),
    signature: "0x"
  };
}

export async function estimateFeesWithTokens({
  paymaster,
  provider,
  tokens,
  nativeMaxCost
}: {
  paymaster: string;
  provider: ethers.Provider;
  tokens: string[];
  nativeMaxCost: bigint;
}): Promise<FeeTokenQuote[]> {
  const contract = getPaymasterContract(paymaster, provider);

  return Promise.all(
    tokens.map(async (token) => {
      try {
        const estimatedFee = await contract.quoteTokenFee(token, nativeMaxCost);
        return { token, estimatedFee, available: true, reason: "" };
      } catch (error) {
        return {
          token,
          estimatedFee: BigInt(0),
          available: false,
          reason: error instanceof Error ? error.message : "fee token unavailable"
        };
      }
    })
  );
}

export async function signUserOperation({
  entryPoint,
  op,
  owner
}: {
  entryPoint: string;
  op: PackedUserOperation;
  owner: ethers.Signer;
}) {
  if (!owner.provider) {
    throw new Error("Signer must be connected to a provider");
  }

  const contract = getEntryPointContract(entryPoint, owner.provider);
  const userOpHash = await contract.getUserOpHash(op);
  return owner.signMessage(ethers.getBytes(userOpHash));
}

export async function withUserOperationSignature({
  entryPoint,
  op,
  owner
}: {
  entryPoint: string;
  op: PackedUserOperation;
  owner: ethers.Signer;
}) {
  return {
    ...op,
    signature: await signUserOperation({ entryPoint, op, owner })
  };
}

export async function submitUserOperation({
  entryPoint,
  op,
  beneficiary,
  bundler
}: {
  entryPoint: string;
  op: PackedUserOperation;
  beneficiary: string;
  bundler: ethers.Signer;
}) {
  const contract = getEntryPointContract(entryPoint, bundler);
  return contract.handleOps([op], beneficiary);
}

export async function getSettlementState({
  paymaster,
  treasuryManager,
  feeTokens,
  provider
}: {
  paymaster: string;
  treasuryManager: string;
  feeTokens: string[];
  provider: ethers.Provider;
}) {
  const paymasterContract = getPaymasterContract(paymaster, provider);
  const treasuryContract = getTreasuryManagerContract(treasuryManager, provider);
  const entryPointDeposit = await paymasterContract.getDeposit();
  const tokenBalances = await Promise.all(
    feeTokens.map(async (token) => ({
      token,
      balance: await treasuryContract.tokenBalance(token)
    }))
  );

  return {
    entryPointDeposit,
    tokenBalances
  };
}

export async function convertStablecoinAndRefill({
  treasuryManager,
  router,
  token,
  amountIn,
  minKiiOut,
  operator
}: {
  treasuryManager: string;
  router: string;
  token: string;
  amountIn: bigint;
  minKiiOut: bigint;
  operator: ethers.Signer;
}) {
  const treasury = getTreasuryManagerContract(treasuryManager, operator);
  return treasury.convertAndRefill(router, token, amountIn, minKiiOut);
}
