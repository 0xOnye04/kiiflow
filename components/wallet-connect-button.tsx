"use client";

import { useEffect, useState } from "react";
import { ChevronDown, LogOut, Loader2, WalletCards } from "lucide-react";
import {
  connectKiiWallet,
  disconnectKiiWallet,
  getConnectedKiiAccount,
  getInjectedEthereumProvider,
  getWalletErrorMessage,
  KII_WALLET_DISCONNECT_EVENT
} from "@/lib/kii-wallet";
import { shortenAddress } from "@/lib/kiichain";
import { Button } from "@/components/ui/button";

export function WalletConnectButton() {
  const [address, setAddress] = useState<string | null>(null);
  const [isKiiChain, setIsKiiChain] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    getConnectedKiiAccount()
      .then((account) => {
        if (!mounted || !account) {
          return;
        }

        setAddress(account.address);
        setIsKiiChain(account.isKiiChain);
      })
      .catch(() => undefined);

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = Array.isArray(args[0]) ? args[0] : [];
      const nextAddress = typeof accounts[0] === "string" ? accounts[0] : null;
      setAddress(nextAddress);
    };

    const handleChainChanged = () => {
      getConnectedKiiAccount()
        .then((account) => setIsKiiChain(Boolean(account?.isKiiChain)))
        .catch(() => setIsKiiChain(false));
    };

    const handleDisconnected = () => {
      setAddress(null);
      setIsKiiChain(false);
    };

    let provider: Awaited<ReturnType<typeof getInjectedEthereumProvider>> = null;
    getInjectedEthereumProvider().then((injectedProvider) => {
      provider = injectedProvider;
      provider?.on?.("accountsChanged", handleAccountsChanged);
      provider?.on?.("chainChanged", handleChainChanged);
    });
    window.addEventListener(KII_WALLET_DISCONNECT_EVENT, handleDisconnected);

    return () => {
      mounted = false;
      provider?.removeListener?.("accountsChanged", handleAccountsChanged);
      provider?.removeListener?.("chainChanged", handleChainChanged);
      window.removeEventListener(KII_WALLET_DISCONNECT_EVENT, handleDisconnected);
    };
  }, []);

  async function handleConnect() {
    setError(null);
    setIsConnecting(true);

    try {
      const wallet = await connectKiiWallet();
      setAddress(wallet.address);
      setIsKiiChain(true);
    } catch (connectError) {
      setError(getWalletErrorMessage(connectError));
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="relative flex items-center gap-2">
      <Button
        variant="outline"
        className="gap-2"
        onClick={handleConnect}
        disabled={isConnecting}
        title={error ?? undefined}
      >
        {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}
        <span className="hidden sm:inline">{address ? shortenAddress(address) : "Connect wallet"}</span>
        {address && (
          <span
            className={isKiiChain ? "h-2 w-2 rounded-full bg-teal-300" : "h-2 w-2 rounded-full bg-amber-300"}
            title={isKiiChain ? "Connected to KiiChain" : "Connected wallet is not on KiiChain"}
          />
        )}
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </Button>
      {address && (
        <Button variant="ghost" size="icon" aria-label="Disconnect wallet" onClick={disconnectKiiWallet}>
          <LogOut className="h-4 w-4" />
        </Button>
      )}
      {error && (
        <div className="absolute right-0 top-12 z-30 w-72 rounded-lg border border-red-300/20 bg-red-950/90 p-3 text-xs text-red-100 shadow-2xl backdrop-blur">
          {error}
        </div>
      )}
    </div>
  );
}
