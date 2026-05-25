"use client";

import { BrowserProvider, type Eip1193Provider } from "ethers";
import { kiiChain, kiiWalletChainParams } from "@/lib/kiichain";

export const KII_WALLET_DISCONNECT_EVENT = "kiiflow:wallet-disconnect";
const KII_WALLET_SESSION_KEY = "kiiflow.wallet.connected";

type EthereumProvider = Eip1193Provider & {
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

type Eip6963ProviderDetail = {
  info?: {
    name?: string;
    rdns?: string;
  };
  provider: EthereumProvider;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export async function connectKiiWallet() {
  const injectedProvider = await getInjectedEthereumProvider();

  if (!injectedProvider) {
    throw new Error("No EVM wallet found. Install MetaMask or another browser wallet.");
  }

  const provider = new BrowserProvider(injectedProvider, "any");
  const accounts = await requestWalletAccounts(provider);

  await addOrSwitchKiiChain(injectedProvider);

  const signer = await provider.getSigner();
  const network = await provider.getNetwork();
  setKiiWalletSessionConnected(true);

  return {
    address: accounts[0] ?? (await signer.getAddress()),
    chainId: Number(network.chainId),
    signer
  };
}

export async function switchToKiiChain() {
  const injectedProvider = await getInjectedEthereumProvider();

  if (!injectedProvider) {
    throw new Error("No EVM wallet found. Install MetaMask or another browser wallet.");
  }

  try {
    await addOrSwitchKiiChain(injectedProvider);
  } catch (error) {
    throw new Error(getWalletErrorMessage(error));
  }
}

async function addOrSwitchKiiChain(provider: EthereumProvider) {
  const chainId = kiiWalletChainParams.chainId;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }]
    });
  } catch (error) {
    const code = getProviderErrorCode(error);

    if (code !== 4902) {
      throw new Error(getWalletErrorMessage(error));
    }

    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [kiiWalletChainParams]
      });
    } catch (addError) {
      throw new Error(getWalletErrorMessage(addError));
    }
  }
}

export async function getConnectedKiiAccount() {
  const injectedProvider = await getInjectedEthereumProvider();

  if (!injectedProvider) {
    return null;
  }

  if (!isKiiWalletSessionConnected()) {
    return null;
  }

  const provider = new BrowserProvider(injectedProvider);
  const accounts = (await provider.send("eth_accounts", [])) as string[];

  if (!accounts[0]) {
    return null;
  }

  const network = await provider.getNetwork();

  return {
    address: accounts[0],
    chainId: Number(network.chainId),
    isKiiChain: Number(network.chainId) === kiiChain.id
  };
}

export async function getInjectedEthereumProvider() {
  if (typeof window === "undefined") {
    return null;
  }

  const announcedProviders = await requestEip6963Providers();
  const legacyProviders = getLegacyProviders();
  const providers = dedupeProviders([
    ...announcedProviders.map((detail) => detail.provider),
    ...legacyProviders
  ]);

  const metamaskDetail = announcedProviders.find((detail) => {
    const rdns = detail.info?.rdns?.toLowerCase() ?? "";
    const name = detail.info?.name?.toLowerCase() ?? "";

    return rdns.includes("metamask") || name.includes("metamask");
  });

  return metamaskDetail?.provider ?? providers.find((provider) => provider.isMetaMask) ?? providers[0] ?? null;
}

function getLegacyProviders() {
  const ethereum = window.ethereum;

  if (!ethereum) {
    return [];
  }

  return ethereum.providers?.length ? ethereum.providers : [ethereum];
}

function requestEip6963Providers() {
  return new Promise<Eip6963ProviderDetail[]>((resolve) => {
    if (typeof window === "undefined") {
      resolve([]);
      return;
    }

    const providers: Eip6963ProviderDetail[] = [];
    const handleProvider = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;

      if (detail?.provider) {
        providers.push(detail);
      }
    };

    window.addEventListener("eip6963:announceProvider", handleProvider);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    window.setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", handleProvider);
      resolve(providers);
    }, 100);
  });
}

function dedupeProviders(providers: EthereumProvider[]) {
  return providers.filter((provider, index) => providers.indexOf(provider) === index);
}

async function requestWalletAccounts(provider: BrowserProvider) {
  try {
    return (await provider.send("eth_requestAccounts", [])) as string[];
  } catch (error) {
    throw new Error(getWalletErrorMessage(error));
  }
}

export function disconnectKiiWallet() {
  setKiiWalletSessionConnected(false);
  window.dispatchEvent(new Event(KII_WALLET_DISCONNECT_EVENT));
}

export function isKiiWalletSessionConnected() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(KII_WALLET_SESSION_KEY) === "true";
}

function setKiiWalletSessionConnected(value: boolean) {
  if (value) {
    window.localStorage.setItem(KII_WALLET_SESSION_KEY, "true");
    return;
  }

  window.localStorage.removeItem(KII_WALLET_SESSION_KEY);
}

function getProviderErrorCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    return Number(error.code);
  }

  return undefined;
}

export function getWalletErrorMessage(error: unknown) {
  const code = getProviderErrorCode(error);

  if (code === 4001) {
    return "Wallet request was rejected.";
  }

  if (code === -32002) {
    return "A wallet request is already open. Check MetaMask and finish or reject the pending request.";
  }

  if (code === -32603) {
    return readProviderMessage(error) ?? "The wallet could not complete the request. Try refreshing the page and reconnecting.";
  }

  return readProviderMessage(error) ?? "Wallet connection failed. Try refreshing the page or disabling duplicate wallet extensions.";
}

function readProviderMessage(error: unknown): string | null {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error !== "object" || !error) {
    return null;
  }

  if ("message" in error && typeof error.message === "string") {
    return error.message;
  }

  if ("data" in error && typeof error.data === "object" && error.data && "message" in error.data && typeof error.data.message === "string") {
    return error.data.message;
  }

  return null;
}
