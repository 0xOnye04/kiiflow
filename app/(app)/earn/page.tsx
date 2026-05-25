"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { ArrowUpRight, CalendarClock, Loader2, LockKeyhole, Percent, RefreshCw } from "lucide-react";
import { NetworkSwitchButton } from "@/components/network-switch-button";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { getLockVaultContract, LOCK_VAULT_ADDRESS } from "@/lib/contract-helpers";
import { getConnectedKiiAccount, getInjectedEthereumProvider } from "@/lib/kii-wallet";
import {
  Erc20Token,
  SUPPORTED_TOKENS,
  approveIfNeeded,
  formatTokenAmount,
  getBrowserProvider,
  getKiiSigner,
  getWalletBalances,
  parseAmount
} from "@/lib/chain-transactions";

const LOCK_OPTIONS = [
  { days: 30, label: "30 days", rewardBps: 240 },
  { days: 90, label: "90 days", rewardBps: 760 },
  { days: 180, label: "180 days", rewardBps: 1380 }
];

type WalletState = {
  address: string;
  isKiiChain: boolean;
};

type VaultPosition = {
  id: number;
  token: Erc20Token;
  amount: bigint;
  reward: bigint;
  unlockTimestamp: bigint;
  withdrawn: boolean;
  isUnlocked: boolean;
};

export default function EarnPage() {
  const lockTokens = useMemo(() => {
    const allowed = new Set(["WKII", "USDC", "USDT"]);
    return SUPPORTED_TOKENS.filter((token): token is Erc20Token => !token.isNative && allowed.has(token.symbol));
  }, []);

  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [positions, setPositions] = useState<VaultPosition[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState<Erc20Token["id"]>("USDC");
  const [amount, setAmount] = useState("10");
  const [selectedDays, setSelectedDays] = useState(90);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [createdPositionId, setCreatedPositionId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedToken = useMemo(
    () => lockTokens.find((token) => token.id === selectedTokenId) ?? lockTokens[0],
    [lockTokens, selectedTokenId]
  );
  const selectedOption = LOCK_OPTIONS.find((option) => option.days === selectedDays) ?? LOCK_OPTIONS[1];
  const amountIn = parseAmount(amount, selectedToken.decimals);
  const projectedReward = (amountIn * BigInt(selectedOption.rewardBps)) / BigInt(10_000);
  const isVaultConfigured = ethers.isAddress(LOCK_VAULT_ADDRESS);
  const isConnected = Boolean(wallet?.address && wallet.isKiiChain);

  const refreshOnChainState = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const account = await getConnectedKiiAccount();
      if (!account) {
        setWallet(null);
        setBalances({});
        setPositions([]);
        return;
      }

      setWallet({ address: account.address, isKiiChain: account.isKiiChain });
      if (!account.isKiiChain || !isVaultConfigured) {
        setPositions([]);
        return;
      }

      const provider = await getBrowserProvider();
      const walletBalances = await getWalletBalances(account.address);
      setBalances(
        Object.fromEntries(
          walletBalances.tokenBalances.map(({ token, balance }) => [
            token.symbol,
            balance != null ? formatTokenAmount(balance, token.decimals, 6) : "0"
          ])
        )
      );

      const vault = getLockVaultContract(provider);
      const nextPositionId = Number(await vault.nextPositionId());
      const startId = Math.max(1, nextPositionId - 50);
      const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
      const loaded: VaultPosition[] = [];

      for (let id = startId; id < nextPositionId; id += 1) {
        try {
          const position = await vault.getPosition(id);
          const owner = String(position.owner ?? position[1]).toLowerCase();
          const tokenAddress = String(position.token ?? position[0]);
          const token = lockTokens.find((item) => item.address.toLowerCase() === tokenAddress.toLowerCase());

          if (owner === account.address.toLowerCase() && token) {
            loaded.push({
              id,
              token,
              amount: BigInt(position.amount ?? position[2]),
              reward: BigInt(position.reward ?? position[3]),
              unlockTimestamp: BigInt(position.unlockTimestamp ?? position[4]),
              withdrawn: Boolean(position.withdrawn ?? position[5]),
              isUnlocked: BigInt(position.unlockTimestamp ?? position[4]) <= nowSeconds
            });
          }
        } catch {
          // Ignore empty or unreadable historical slots while scanning recent positions.
        }
      }

      setPositions(loaded.reverse());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setIsLoading(false);
    }
  }, [isVaultConfigured, lockTokens]);

  useEffect(() => {
    const handleChange = () => refreshOnChainState();
    let provider: Awaited<ReturnType<typeof getInjectedEthereumProvider>> = null;
    getInjectedEthereumProvider().then((injectedProvider) => {
      provider = injectedProvider;
      provider?.on?.("accountsChanged", handleChange);
      provider?.on?.("chainChanged", handleChange);
    });
    queueMicrotask(() => {
      refreshOnChainState();
    });
    return () => {
      provider?.removeListener?.("accountsChanged", handleChange);
      provider?.removeListener?.("chainChanged", handleChange);
    };
  }, [refreshOnChainState]);

  const handleLock = async () => {
    setError(null);
    setTxHash(null);
    setCreatedPositionId(null);
    setIsLocking(true);

    try {
      if (!isVaultConfigured) {
        throw new Error("LockVault is not deployed yet. Deploy it and set NEXT_PUBLIC_LOCK_VAULT_ADDRESS.");
      }

      if (!wallet?.address || !wallet.isKiiChain) {
        throw new Error("Connect MetaMask to KiiChain Testnet Oro first.");
      }

      if (amountIn <= BigInt(0)) {
        throw new Error("Enter an amount greater than zero.");
      }

      const signer = await getKiiSigner();
      const vault = getLockVaultContract(signer);

      await approveIfNeeded({
        signer,
        token: selectedToken,
        spender: LOCK_VAULT_ADDRESS,
        owner: wallet.address,
        amount: amountIn
      });

      const tx = await vault.lock(selectedToken.address, amountIn, selectedDays);
      setTxHash(tx.hash);
      const receipt = await tx.wait();
      const lockedEvent = receipt?.logs
        .map((log: ethers.Log) => {
          try {
            return vault.interface.parseLog({ topics: [...log.topics], data: log.data });
          } catch {
            return null;
          }
        })
        .find((event: ethers.LogDescription | null) => event?.name === "TokenLocked");

      if (lockedEvent) {
        setCreatedPositionId(Number(lockedEvent.args.positionId));
      }

      await refreshOnChainState();
    } catch (lockError) {
      setError(lockError instanceof Error ? lockError.message : String(lockError));
    } finally {
      setIsLocking(false);
    }
  };

  const activePositions = positions.filter((position) => !position.withdrawn);
  const totalLockedLabel = activePositions.length
    ? `${activePositions.length} on-chain position${activePositions.length === 1 ? "" : "s"}`
    : "No active positions";
  const nextUnlock = activePositions
    .map((position) => Number(position.unlockTimestamp) * 1000)
    .sort((a, b) => a - b)[0];

  return (
    <div>
      <PageHeader
        eyebrow="Lock / Earn"
        title="Lock real KiiChain assets"
        description="Create on-chain LockVault positions using deployed KiiDex testnet ERC20 assets."
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <WalletConnectButton />
          <NetworkSwitchButton variant="secondary" className="gap-2" />
          {wallet?.address && (
            <Badge className={wallet.isKiiChain ? "text-teal-100" : "text-amber-100"}>
              {wallet.isKiiChain ? "KiiChain connected" : "Wrong network"}
            </Badge>
          )}
        </div>
        <Button variant="ghost" className="gap-2" onClick={refreshOnChainState} disabled={isLoading}>
          <RefreshCw className={isLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Vault contract" value={isVaultConfigured ? "Deployed" : "Missing"} delta={isVaultConfigured ? `${LOCK_VAULT_ADDRESS.slice(0, 10)}...` : "Set env address"} icon={LockKeyhole} />
        <StatCard label="Selected reward" value={`${selectedOption.rewardBps / 100}%`} delta={selectedOption.label} icon={Percent} />
        <StatCard label="Next unlock" value={nextUnlock ? new Date(nextUnlock).toLocaleDateString() : "None"} delta={totalLockedLabel} icon={CalendarClock} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create Position</CardTitle>
            <CardDescription>Approves the vault, then locks the selected ERC20 on KiiChain.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-2 block text-sm text-muted-foreground">Amount to lock</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="h-14 text-3xl font-semibold"
                  placeholder="0"
                />
                <select
                  value={selectedTokenId}
                  onChange={(event) => setSelectedTokenId(event.target.value as Erc20Token["id"])}
                  className="h-14 min-w-28 rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-slate-100"
                >
                  {lockTokens.map((token) => (
                    <option key={token.address} value={token.id}>
                      {token.symbol}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Balance: {balances[selectedToken.symbol] ?? "0"} {selectedToken.symbol}
              </div>
            </div>

            <div className="grid gap-3">
              {LOCK_OPTIONS.map((option) => (
                <button
                  key={option.days}
                  onClick={() => setSelectedDays(option.days)}
                  className={`rounded-lg border p-4 text-left transition ${
                    selectedDays === option.days
                      ? "border-teal-300/50 bg-teal-300/10"
                      : "border-white/10 bg-white/[0.045] hover:bg-white/[0.08]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground">Reward paid from vault reserves at withdraw</div>
                    </div>
                    <Badge className="text-teal-100">{option.rewardBps / 100}%</Badge>
                  </div>
                </button>
              ))}
            </div>

            <div className="rounded-lg bg-white/[0.045] p-4 text-sm">
              <div className="flex justify-between py-1 text-muted-foreground">
                <span>Projected reward</span>
                <span className="text-foreground">{ethers.formatUnits(projectedReward, selectedToken.decimals)} {selectedToken.symbol}</span>
              </div>
              <div className="flex justify-between py-1 text-muted-foreground">
                <span>Vault</span>
                <span>{isVaultConfigured ? `${LOCK_VAULT_ADDRESS.slice(0, 6)}...${LOCK_VAULT_ADDRESS.slice(-4)}` : "Not configured"}</span>
              </div>
              <div className="flex justify-between py-1 text-muted-foreground">
                <span>Early unlock</span>
                <span>Disabled by contract</span>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-400/20 bg-rose-950/30 p-4 text-sm text-rose-100">
                {error}
              </div>
            )}

            {txHash && (
              <div className="rounded-lg border border-teal-300/20 bg-teal-950/20 p-4 text-sm text-teal-100">
                <div className="break-all">Lock tx: {txHash}</div>
                {createdPositionId != null && <div className="mt-1">Position #{createdPositionId}</div>}
              </div>
            )}

            <Button className="h-12 w-full gap-2" onClick={handleLock} disabled={isLocking || !isConnected || !isVaultConfigured}>
              {isLocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
              {isVaultConfigured ? "Approve and lock" : "Deploy LockVault first"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>On-chain positions</CardTitle>
            <CardDescription>Recent LockVault positions owned by the connected wallet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {positions.length === 0 && (
              <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4 text-sm text-muted-foreground">
                No LockVault positions found for this wallet.
              </div>
            )}

            {positions.map((position) => {
              const unlockDate = new Date(Number(position.unlockTimestamp) * 1000);

              return (
                <div key={position.id} className="rounded-lg bg-white/[0.045] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">Position #{position.id}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatTokenAmount(position.amount, position.token.decimals)} {position.token.symbol} locked
                      </div>
                    </div>
                    <Badge>{position.withdrawn ? "Withdrawn" : position.isUnlocked ? "Unlocked" : "Locked"}</Badge>
                  </div>
                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <div>Reward: {formatTokenAmount(position.reward, position.token.decimals)} {position.token.symbol}</div>
                    <div>Unlock: {unlockDate.toLocaleString()}</div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
