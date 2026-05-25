import { ethers } from "ethers";
import { KII_DEX_TOKENS } from "@/lib/kiichain";

export const FEE_TOKENS = [
  { id: "KII", label: "KII", symbol: "KII", isNative: true },
  {
    id: "USDC",
    label: "USDC",
    symbol: "USDC",
    isNative: false,
    address: KII_DEX_TOKENS.find((token) => token.symbol === "USDC")!.address
  },
  {
    id: "USDT",
    label: "USDT",
    symbol: "USDT",
    isNative: false,
    address: KII_DEX_TOKENS.find((token) => token.symbol === "USDT")!.address
  }
] as const;

export type FeeToken = (typeof FEE_TOKENS)[number];

export interface EstimateData {
  gasEstimate: bigint;
  gasPrice: bigint;
  nativeFeeWei: bigint;
  nativeFeeKii: string;
  tokenContractAvailable: boolean;
  routeAvailable: boolean;
  tokenBalance?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  tokenTransferGas?: bigint;
  tokenRouteFeeKii?: string;
  paymasterAvailable: boolean;
  paymasterDepositKii?: string;
  paymasterTokenFee?: string;
  warnings: string[];
}

export const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

const PAYMASTER_ABI = [
  "function quoteTokenFee(address token,uint256 nativeWeiCost) view returns (uint256)",
  "function getDeposit() view returns (uint256)"
];

const PAYMASTER_ADDRESS = process.env.NEXT_PUBLIC_PAYMASTER_ADDRESS || "";

export function parseAmount(value: string, decimals = 18) {
  try {
    return ethers.parseUnits(value || "0", decimals);
  } catch {
    return ethers.parseUnits("0", decimals);
  }
}

export async function safeEstimateGas(
  signer: ethers.Signer,
  transaction: Parameters<ethers.Signer["estimateGas"]>[0],
  fallbackGas?: bigint
) {
  try {
    return await signer.estimateGas(transaction);
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    const isFallbackSafe =
      err.code === "CALL_EXCEPTION" ||
      err.message?.includes("missing revert data") ||
      err.message?.includes("cannot estimate gas");

    if (fallbackGas != null && isFallbackSafe) {
      return fallbackGas;
    }

    throw error;
  }
}

async function hasContractCode(provider: ethers.Provider, address: string) {
  if (!ethers.isAddress(address)) {
    return false;
  }

  try {
    const code = await provider.getCode(address);
    return Boolean(code && code !== "0x");
  } catch {
    return false;
  }
}

export async function resolveGasPrice(provider: any) {
  try {
    const gasPriceRaw = await provider.send?.("eth_gasPrice", []);
    if (gasPriceRaw != null) {
      return typeof gasPriceRaw === "bigint"
        ? gasPriceRaw
        : BigInt(gasPriceRaw.toString());
    }
  } catch {
    // Fallback to provider helper methods if direct RPC gas price fails.
  }

  try {
    const feeData = await provider.getFeeData();
    if (feeData?.maxFeePerGas) {
      return feeData.maxFeePerGas;
    }
    if (feeData?.gasPrice) {
      return feeData.gasPrice;
    }
  } catch {
    // Provider may not support EIP-1559 fee methods on this RPC.
  }

  if (typeof provider.getGasPrice === "function") {
    const gasPrice = await provider.getGasPrice();
    if (gasPrice) {
      return gasPrice;
    }
  }

  throw new Error("Unable to determine gas price from provider.");
}

export async function estimateFee({
  signer,
  provider,
  selectedToken,
  recipientAddress,
  amount,
  account
}: {
  signer: ethers.Signer;
  provider: any;
  selectedToken: FeeToken;
  recipientAddress: string;
  amount: string;
  account: string;
}): Promise<EstimateData> {
  const warnings: string[] = [];
  const gasPrice = await resolveGasPrice(provider);
  const nativeValue = parseAmount(amount, 18);
  const mainGasEstimate = await safeEstimateGas(
    signer,
    {
      to: recipientAddress,
      value: selectedToken.isNative ? nativeValue : 0
    },
    BigInt(21000)
  );

  let tokenContractAvailable = false;
  let tokenBalance: string | undefined;
  let tokenSymbol: string | undefined;
  let tokenDecimals: number | undefined;
  let tokenTransferGas: bigint | undefined;
  let routeAvailable = selectedToken.isNative;
  let paymasterAvailable = selectedToken.isNative;
  let paymasterDepositKii: string | undefined;
  let paymasterTokenFee: string | undefined;

  if (!selectedToken.isNative && selectedToken.address) {
    const tokenAddress = selectedToken.address.toLowerCase();
    if (!ethers.isAddress(tokenAddress)) {
      warnings.push(
        "Selected token address is not valid for this network. Native gas fallback is being used."
      );
    } else if (!(await hasContractCode(provider, tokenAddress))) {
      warnings.push(
        "Selected token contract is not deployed on this network. Native KII fallback is being used."
      );
    } else {
      try {
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        tokenContractAvailable = true;
        tokenSymbol = await contract.symbol();
        tokenDecimals = await contract.decimals();
        const balanceRaw = await contract.balanceOf(account);
        const transferAmount = parseAmount(amount, tokenDecimals ?? 6);
        const stableAmount = transferAmount > 0 ? transferAmount : parseAmount("1", tokenDecimals ?? 6);
        const data = contract.interface.encodeFunctionData("transfer", [recipientAddress, stableAmount]);
        tokenTransferGas = await signer.estimateGas({ to: tokenAddress, data });
        tokenBalance = ethers.formatUnits(balanceRaw, tokenDecimals);
        routeAvailable = Number(tokenBalance) > 0 && (tokenTransferGas ?? BigInt(0)) > BigInt(0);

        if (!routeAvailable) {
          warnings.push(
            "A token paymaster route could not be confirmed. The UI will preserve native KII fallback liquidity."
          );
        }

        if (balanceRaw === BigInt(0)) {
          warnings.push("Selected token balance is zero. Fallback to native gas or fund the token on chain.");
        }
      } catch {
        warnings.push(
          "Token contract check failed on this network. A native gas fallback route is recommended."
        );
      }
    }
  }

  const nativeFeeWei = mainGasEstimate * gasPrice;
  const nativeFeeKii = ethers.formatEther(nativeFeeWei);
  const tokenRouteFeeKii = tokenTransferGas ? ethers.formatEther(tokenTransferGas * gasPrice) : undefined;

  if (!selectedToken.isNative && selectedToken.address) {
    if (!ethers.isAddress(PAYMASTER_ADDRESS)) {
      warnings.push("Stablecoin Paymaster address is not configured for the frontend.");
    } else if (!(await hasContractCode(provider, PAYMASTER_ADDRESS))) {
      warnings.push("Stablecoin Paymaster is not deployed at the configured address.");
    } else {
      try {
        const paymaster = new ethers.Contract(PAYMASTER_ADDRESS, PAYMASTER_ABI, provider);
        const [tokenFeeRaw, depositRaw] = await Promise.all([
          paymaster.quoteTokenFee(selectedToken.address, nativeFeeWei),
          paymaster.getDeposit()
        ]);
        paymasterAvailable = true;
        routeAvailable = routeAvailable && tokenContractAvailable;
        paymasterDepositKii = ethers.formatEther(depositRaw);
        paymasterTokenFee = ethers.formatUnits(tokenFeeRaw, tokenDecimals ?? 6);
      } catch (paymasterError) {
        warnings.push(
          paymasterError instanceof Error
            ? `Paymaster quote failed: ${paymasterError.message}`
            : "Paymaster quote failed for the selected token."
        );
      }
    }
  }

  if (!selectedToken.isNative) {
    const nativeBalance = await provider.getBalance(account);
    if (nativeBalance < nativeFeeWei + nativeFeeWei) {
      warnings.push(
        "Your native KII balance is low for settling any fee relay or fallback route."
      );
    }
  }

  return {
    gasEstimate: mainGasEstimate,
    gasPrice,
    nativeFeeWei,
    nativeFeeKii,
    tokenContractAvailable,
    routeAvailable,
    tokenBalance,
    tokenSymbol,
    tokenDecimals,
    tokenTransferGas,
    tokenRouteFeeKii,
    paymasterAvailable,
    paymasterDepositKii,
    paymasterTokenFee,
    warnings
  };
}

export function getFeeTokenById(tokenId: FeeToken["id"]) {
  return FEE_TOKENS.find((token) => token.id === tokenId) ?? FEE_TOKENS[0];
}
