import {
  KIICHAIN_BASE_DENOM,
  KIICHAIN_LCD_ENDPOINT,
  ORO_ASSET,
  TESTNET_ORO_EVM
} from "@kiichain/kiijs-evm";
import { createPublicClient, http } from "viem";

export const kiiChain = TESTNET_ORO_EVM;
export const kiiBaseDenom = KIICHAIN_BASE_DENOM;
export const kiiLcdEndpoint = KIICHAIN_LCD_ENDPOINT;
export const oroAsset = ORO_ASSET;

export const KII_DEX_TOKENS = [
  {
    id: "WKII",
    name: "Wrapped Kii",
    symbol: "WKII",
    address: "0xd51e7187e54a4A22D790f8bbDdd9B54b891Bc920",
    decimals: 18
  },
  {
    id: "USDC",
    name: "USD Coin",
    symbol: "USDC",
    address: "0xb72FfA8E8079365c1890948464B542E42EEC892B",
    decimals: 6
  },
  {
    id: "USDT",
    name: "Tether USD",
    symbol: "USDT",
    address: "0x1A9992f48dE81C57D38147F3c573E84575021de6",
    decimals: 6
  },
  {
    id: "WBTC",
    name: "Wrapped BTC",
    symbol: "WBTC",
    address: "0x7806BbEf4F5aba0Bd0e96139EeEb2DF88E7839e5",
    decimals: 8
  },
  {
    id: "BRL",
    name: "Brazilian Reais",
    symbol: "BRL",
    address: "0x83ddda4E424714a873ffB3c74DeC3375fF46Baec",
    decimals: 6
  }
] as const;

export const KII_DEX_CONTRACTS = {
  swapRouter02: "0xa9fD599cd8857e90059c83e4885Dc09986039085",
  quoter: "0xa52e69e335Ec923Ad76ab1Ffa66c967eF1aa6194",
  nonfungiblePositionManager: "0x841231Aa31685321E0bAED56e4b17Cae093Bf0fB",
  permit2: "0x6b0bc2e986B0e70DB48296619A96E9ac02c5574b",
  multicall: "0x26Eb58c5eB13F56849770cd8333a83f3e6086665"
} as const;

export const kiiPublicClient = createPublicClient({
  chain: kiiChain,
  transport: http()
});

export const kiiWalletChainParams = {
  chainId: `0x${kiiChain.id.toString(16)}`,
  chainName: kiiChain.name,
  nativeCurrency: kiiChain.nativeCurrency,
  rpcUrls: [...kiiChain.rpcUrls.default.http],
  blockExplorerUrls: [kiiChain.blockExplorers.default.url]
};

export function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
