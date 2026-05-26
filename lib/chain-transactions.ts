import { ethers } from "ethers";
import { BrowserProvider } from "ethers";
import { KII_DEX_CONTRACTS, KII_DEX_TOKENS, kiiChain } from "./kiichain";
import { getInjectedEthereumProvider } from "./kii-wallet";

export const NATIVE_KII_TOKEN = {
  id: "KII",
  name: "Kii",
  symbol: "KII",
  isNative: true,
  decimals: 18
} as const;

export const SUPPORTED_TOKENS = [
  NATIVE_KII_TOKEN,
  ...KII_DEX_TOKENS.map((token) => ({ ...token, isNative: false as const }))
] as const;

export type SupportedToken = (typeof SUPPORTED_TOKENS)[number];
export type Erc20Token = Extract<SupportedToken, { isNative: false }>;

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function transfer(address to,uint256 amount) returns (bool)"
];

export const WRAPPED_KII_ABI = [
  ...ERC20_ABI,
  "function deposit() payable",
  "function withdraw(uint256 amount)"
];

const QUOTER_V2_ABI = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)"
];

export const SWAP_ROUTER_02_ABI = [
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)"
];

export async function getBrowserProvider() {
  const injectedProvider = await getInjectedEthereumProvider();

  if (!injectedProvider) {
    throw new Error("No injected wallet found. Install MetaMask or another EVM wallet.");
  }

  return new BrowserProvider(injectedProvider, "any");
}

export async function getKiiSigner() {
  const provider = await getBrowserProvider();
  await provider.send("eth_requestAccounts", []);
  return provider.getSigner();
}

export async function getConnectedAddress() {
  const provider = await getBrowserProvider();
  const accounts = (await provider.send("eth_accounts", [])) as string[];
  return accounts[0] ?? null;
}

export function parseAmount(value: string, decimals = 18) {
  try {
    return ethers.parseUnits(value || "0", decimals);
  } catch {
    return ethers.parseUnits("0", decimals);
  }
}

export function formatTokenAmount(value: bigint, decimals: number, maximumFractionDigits = 6) {
  return Number(ethers.formatUnits(value, decimals)).toLocaleString(undefined, { maximumFractionDigits });
}

export async function getTokenBalance(tokenAddress: string, account: string, provider: ethers.Provider) {
  if (!(await hasContractCode(provider, tokenAddress))) {
    return null;
  }

  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  return (await contract.balanceOf(account)) as bigint;
}

export async function getWalletBalances(account: string) {
  const provider = await getBrowserProvider();
  const nativeBalance = await provider.getBalance(account);
  const tokenBalances = await Promise.all(
    KII_DEX_TOKENS.map(async (token) => ({
      token,
      balance: await getTokenBalance(token.address, account, provider)
    }))
  );

  return {
    nativeBalance,
    tokenBalances
  };
}

export function getTokenById(tokenId: SupportedToken["id"]) {
  return SUPPORTED_TOKENS.find((token) => token.id === tokenId) ?? SUPPORTED_TOKENS[0];
}

export function requireErc20Token(token: SupportedToken): Erc20Token {
  if (token.isNative) {
    throw new Error("Use WKII for KiiDex swaps. Native KII must be wrapped before ERC20 router swaps.");
  }

  return token;
}

export function getWrappedKiiToken() {
  const token = KII_DEX_TOKENS.find((item) => item.symbol === "WKII");
  if (!token) {
    throw new Error("WKII token is not configured.");
  }

  return { ...token, isNative: false as const };
}

export function getRouterToken(token: SupportedToken): Erc20Token {
  return token.isNative ? getWrappedKiiToken() : token;
}

export async function approveIfNeeded({
  signer,
  token,
  spender,
  owner,
  amount
}: {
  signer: ethers.Signer;
  token: Erc20Token;
  spender: string;
  owner: string;
  amount: bigint;
}) {
  const contract = new ethers.Contract(token.address, ERC20_ABI, signer);
  const allowance = (await contract.allowance(owner, spender)) as bigint;

  if (allowance >= amount) {
    return null;
  }

  const tx = await contract.approve(spender, amount);
  await tx.wait();
  return tx;
}

export async function quoteKiiDexSwap({
  provider,
  amountIn,
  fromToken,
  toToken
}: {
  provider: ethers.Provider;
  amountIn: bigint;
  fromToken: Erc20Token;
  toToken: Erc20Token;
}) {
  const quoter = new ethers.Contract(KII_DEX_CONTRACTS.quoter, QUOTER_V2_ABI, provider);
  const feeTiers = [500, 3000, 10000] as const;
  const errors: string[] = [];

  for (const fee of feeTiers) {
    try {
      const result = await quoter.quoteExactInputSingle.staticCall({
        tokenIn: fromToken.address,
        tokenOut: toToken.address,
        amountIn,
        fee,
        sqrtPriceLimitX96: 0
      });

      return {
        fee,
        amountOut: result[0] as bigint,
        gasEstimate: result[3] as bigint
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`No KiiDex route found for ${fromToken.symbol} -> ${toToken.symbol}. ${errors[0] ?? ""}`);
}

export async function quoteKiiDexSwapWithNative({
  provider,
  amountIn,
  fromToken,
  toToken
}: {
  provider: ethers.Provider;
  amountIn: bigint;
  fromToken: SupportedToken;
  toToken: SupportedToken;
}) {
  const routerFromToken = getRouterToken(fromToken);
  const routerToToken = getRouterToken(toToken);

  if (routerFromToken.address.toLowerCase() === routerToToken.address.toLowerCase()) {
    return {
      fee: 0,
      amountOut: amountIn,
      gasEstimate: fromToken.isNative ? BigInt(55_000) : BigInt(70_000),
      usesNativeWrap: fromToken.isNative || toToken.isNative,
      routerFromToken,
      routerToToken
    };
  }

  const quote = await quoteKiiDexSwap({
    provider,
    amountIn,
    fromToken: routerFromToken,
    toToken: routerToToken
  });

  return {
    ...quote,
    usesNativeWrap: fromToken.isNative || toToken.isNative,
    routerFromToken,
    routerToToken
  };
}

export async function executeKiiDexSwap({
  signer,
  amountIn,
  amountOutMin,
  fee,
  fromToken,
  toToken,
  recipient
}: {
  signer: ethers.Signer;
  amountIn: bigint;
  amountOutMin: bigint;
  fee: number;
  fromToken: Erc20Token;
  toToken: Erc20Token;
  recipient: string;
}) {
  await approveIfNeeded({
    signer,
    token: fromToken,
    spender: KII_DEX_CONTRACTS.swapRouter02,
    owner: recipient,
    amount: amountIn
  });

  const router = new ethers.Contract(KII_DEX_CONTRACTS.swapRouter02, SWAP_ROUTER_02_ABI, signer);
  return router.exactInputSingle({
    tokenIn: fromToken.address,
    tokenOut: toToken.address,
    fee,
    recipient,
    amountIn,
    amountOutMinimum: amountOutMin,
    sqrtPriceLimitX96: 0
  });
}

export async function executeKiiDexSwapWithNative({
  signer,
  amountIn,
  amountOutMin,
  fee,
  fromToken,
  toToken,
  recipient
}: {
  signer: ethers.Signer;
  amountIn: bigint;
  amountOutMin: bigint;
  fee: number;
  fromToken: SupportedToken;
  toToken: SupportedToken;
  recipient: string;
}) {
  const routerFromToken = getRouterToken(fromToken);
  const routerToToken = getRouterToken(toToken);
  const wrappedKii = new ethers.Contract(getWrappedKiiToken().address, WRAPPED_KII_ABI, signer);
  const hashes: { wrap?: string; approval?: string; swap?: string; unwrap?: string } = {};

  if (routerFromToken.address.toLowerCase() === routerToToken.address.toLowerCase()) {
    if (fromToken.isNative && !toToken.isNative) {
      const wrapTx = await wrappedKii.deposit({ value: amountIn });
      hashes.wrap = wrapTx.hash;
      await wrapTx.wait();
      return hashes;
    }

    if (!fromToken.isNative && toToken.isNative) {
      const unwrapTx = await wrappedKii.withdraw(amountIn);
      hashes.unwrap = unwrapTx.hash;
      await unwrapTx.wait();
      return hashes;
    }

    throw new Error("Select two different assets to build a swap.");
  }

  if (fromToken.isNative) {
    const wrapTx = await wrappedKii.deposit({ value: amountIn });
    hashes.wrap = wrapTx.hash;
    await wrapTx.wait();
  }

  const approvalTx = await approveIfNeeded({
    signer,
    token: routerFromToken,
    spender: KII_DEX_CONTRACTS.swapRouter02,
    owner: recipient,
    amount: amountIn
  });
  hashes.approval = approvalTx?.hash;

  const router = new ethers.Contract(KII_DEX_CONTRACTS.swapRouter02, SWAP_ROUTER_02_ABI, signer);
  const beforeWrappedBalance = toToken.isNative
    ? ((await wrappedKii.balanceOf(recipient)) as bigint)
    : BigInt(0);
  const swapTx = await router.exactInputSingle({
    tokenIn: routerFromToken.address,
    tokenOut: routerToToken.address,
    fee,
    recipient,
    amountIn,
    amountOutMinimum: amountOutMin,
    sqrtPriceLimitX96: 0
  });
  hashes.swap = swapTx.hash;
  await swapTx.wait();

  if (toToken.isNative) {
    const afterWrappedBalance = (await wrappedKii.balanceOf(recipient)) as bigint;
    const unwrapAmount = afterWrappedBalance > beforeWrappedBalance
      ? afterWrappedBalance - beforeWrappedBalance
      : amountOutMin;

    if (unwrapAmount > BigInt(0)) {
      const unwrapTx = await wrappedKii.withdraw(unwrapAmount);
      hashes.unwrap = unwrapTx.hash;
      await unwrapTx.wait();
    }
  }

  return hashes;
}

export async function transferToken({
  signer,
  token,
  to,
  amount
}: {
  signer: ethers.Signer;
  token: SupportedToken;
  to: string;
  amount: bigint;
}) {
  if (token.isNative) {
    return signer.sendTransaction({ to, value: amount });
  }

  const contract = new ethers.Contract(token.address, ERC20_ABI, signer);
  return contract.transfer(to, amount);
}

export function isKiiChainProvider(provider: ethers.BrowserProvider | ethers.JsonRpcProvider) {
  return provider.getNetwork().then((network) => network.chainId === BigInt(kiiChain.id));
}

export async function hasContractCode(provider: ethers.Provider, address: string) {
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
