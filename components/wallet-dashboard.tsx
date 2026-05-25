"use client";

import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { formatEther } from "viem";
import {
  CircleOff,
  Database,
  Landmark,
  LogOut,
  Loader2,
  RadioTower,
  ShieldCheck,
  WalletCards
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { NetworkSwitchButton } from "@/components/network-switch-button";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FeeAbstractionPanel } from "@/components/fee-abstraction-panel";
import {
  connectKiiWallet,
  disconnectKiiWallet,
  getConnectedKiiAccount,
  getInjectedEthereumProvider,
  getWalletErrorMessage,
  KII_WALLET_DISCONNECT_EVENT
} from "@/lib/kii-wallet";
import { getWalletBalances } from "@/lib/chain-transactions";
import { kiiChain, kiiPublicClient, shortenAddress } from "@/lib/kiichain";

type DashboardState = {
  address: string | null;
  chainId: number | null;
  isKiiChain: boolean;
  balance: string | null;
  tokenBalances: Record<string, string>;
};

export function WalletDashboard() {
  const [state, setState] = useState<DashboardState>({
    address: null,
    chainId: null,
    isKiiChain: false,
    balance: null,
    tokenBalances: {}
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshWallet = useCallback(async () => {
    setIsLoading(true);

    try {
      const account = await getConnectedKiiAccount();

      if (!account) {
        setState({ address: null, chainId: null, isKiiChain: false, balance: null, tokenBalances: {} });
        return;
      }

      const nativeBalance = account.isKiiChain
        ? await kiiPublicClient.getBalance({ address: account.address as `0x${string}` })
        : null;
      const tokenBalances = account.isKiiChain
        ? await getWalletBalances(account.address)
        : null;

      const formattedTokenBalances = Object.fromEntries(
        tokenBalances?.tokenBalances.map(({ token, balance }) => [
          token.symbol,
          balance != null ? Number(ethers.formatUnits(balance, token.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "0"
        ]) ?? []
      );

      setState({
        address: account.address,
        chainId: account.chainId,
        isKiiChain: account.isKiiChain,
        balance: nativeBalance ? formatEther(nativeBalance) : null,
        tokenBalances: formattedTokenBalances
      });
    } catch (walletError) {
      setError(getWalletErrorMessage(walletError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleWalletChanged = () => {
      refreshWallet();
    };

    const handleDisconnected = () => {
      setState({ address: null, chainId: null, isKiiChain: false, balance: null, tokenBalances: {} });
      setIsLoading(false);
    };

    let provider: Awaited<ReturnType<typeof getInjectedEthereumProvider>> = null;
    getInjectedEthereumProvider().then((injectedProvider) => {
      provider = injectedProvider;
      provider?.on?.("accountsChanged", handleWalletChanged);
      provider?.on?.("chainChanged", handleWalletChanged);
    });
    window.addEventListener(KII_WALLET_DISCONNECT_EVENT, handleDisconnected);
    queueMicrotask(() => {
      refreshWallet();
    });

    return () => {
      provider?.removeListener?.("accountsChanged", handleWalletChanged);
      provider?.removeListener?.("chainChanged", handleWalletChanged);
      window.removeEventListener(KII_WALLET_DISCONNECT_EVENT, handleDisconnected);
    };
  }, [refreshWallet]);

  async function handleConnect() {
    setError(null);
    setIsConnecting(true);

    try {
      await connectKiiWallet();
      await refreshWallet();
    } catch (connectError) {
      setError(getWalletErrorMessage(connectError));
    } finally {
      setIsConnecting(false);
    }
  }

  const balanceDisplay = state.balance ? Number(state.balance).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "0";

  return (
    <div>
      <PageHeader
        eyebrow="KiiChain Wallet"
        title={state.address ? shortenAddress(state.address) : "Connect to KiiChain"}
        description="Connect a wallet to view your KiiChain Testnet Oro account."
      />

      {error && (
        <Card className="mb-4 border-red-300/20 bg-red-950/30">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-red-100">
            <CircleOff className="h-4 w-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="KII balance"
          value={isLoading ? "Loading" : `${balanceDisplay} KII`}
          delta={state.isKiiChain ? "Read from Testnet Oro RPC" : "Connect or switch network to read balance"}
          icon={WalletCards}
        />
        <StatCard
          label="Network"
          value={state.isKiiChain ? "Oro" : "Not selected"}
          delta={`Expected chain ID ${kiiChain.id}`}
          icon={RadioTower}
        />
        <StatCard
          label="Backend status"
          value="Not connected"
          delta="Ready for your API later"
          icon={Database}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Wallet Overview</CardTitle>
              <CardDescription>Live connection state for KiiChain Testnet Oro.</CardDescription>
            </div>
            <Badge className={state.isKiiChain ? "text-teal-100" : "text-amber-100"}>
              {state.isKiiChain ? "On KiiChain" : "Network action needed"}
            </Badge>
          </CardHeader>
          <CardContent>
            {state.address ? (
              <div className="space-y-3">
                <InfoRow label="Address" value={state.address} />
                <InfoRow label="Connected chain" value={state.chainId ? String(state.chainId) : "Unknown"} />
                <InfoRow label="Required chain" value={`${kiiChain.name} (${kiiChain.id})`} />
                <InfoRow label="Native balance" value={state.isKiiChain ? `${balanceDisplay} KII` : "Switch to KiiChain to load"} />
                {state.isKiiChain &&
                  ["WKII", "USDC", "USDT"].map((symbol) => (
                    <InfoRow key={symbol} label={`${symbol} balance`} value={`${state.tokenBalances[symbol] ?? "0"} ${symbol}`} />
                  ))}
                <Button variant="outline" className="gap-2" onClick={disconnectKiiWallet}>
                  <LogOut className="h-4 w-4" />
                  Disconnect wallet
                </Button>
              </div>
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.035] p-8 text-center">
                <WalletCards className="mb-4 h-10 w-10 text-teal-200" />
                <h2 className="text-xl font-semibold">No wallet connected</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Connect MetaMask or another EVM wallet to switch to KiiChain Testnet Oro and load your actual wallet state.
                </p>
                <Button className="mt-5 gap-2" onClick={handleConnect} disabled={isConnecting}>
                  {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}
                  Connect KiiChain wallet
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>KiiChain Controls</CardTitle>
            <CardDescription>Explicit network actions for wallet setup.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg bg-white/[0.045] p-4">
              <RadioTower className="mb-3 h-5 w-5 text-teal-200" />
              <div className="font-medium">Switch wallet network</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Adds or switches MetaMask to KiiChain Testnet Oro using the SDK chain metadata.
              </p>
              <NetworkSwitchButton className="mt-4 w-full gap-2" />
            </div>

            <div className="rounded-lg bg-white/[0.045] p-4">
              <ShieldCheck className="mb-3 h-5 w-5 text-teal-200" />
              <div className="font-medium">Portfolio data</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Token prices, activity, swaps, and earn positions are intentionally empty until your backend or indexer is connected.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <FeeAbstractionPanel walletAddress={state.address} isKiiChain={state.isKiiChain} />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Real transaction history will appear here after you connect an indexer or backend.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-32 items-center justify-center rounded-lg bg-white/[0.035] p-6 text-center text-sm text-muted-foreground">
            <div>
              <Landmark className="mx-auto mb-3 h-6 w-6 text-teal-200" />
              No indexed KiiChain activity yet
            </div>
          </div>
        </CardContent>
      </Card>

      {state.address && !state.isKiiChain && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-50 sm:flex-row sm:items-center sm:justify-between">
          <div>Wallet connected, but it is on chain ID {state.chainId}. Switch to KiiChain Testnet Oro to load balances.</div>
          <NetworkSwitchButton variant="secondary" className="gap-2" />
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-lg bg-white/[0.045] p-3 sm:grid-cols-[11rem_1fr] sm:items-center">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="break-all text-sm font-medium">{value}</div>
    </div>
  );
}
