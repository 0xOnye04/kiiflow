"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { ArrowDown, ArrowRight, ExternalLink, Loader2, RefreshCw, Settings2, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { NetworkSwitchButton } from "@/components/network-switch-button";
import { getConnectedKiiAccount, getInjectedEthereumProvider } from "@/lib/kii-wallet";
import {
  buildSponsoredApprovalUserOperation,
  buildStablecoinSwapUserOperation,
  getSmartAccountAddress,
  isAccountAbstractionConfigured,
  sendUserOperation,
  waitForUserOperationReceipt
} from "@/lib/account-abstraction";
import {
  Erc20Token,
  SUPPORTED_TOKENS,
  SupportedToken,
  executeKiiDexSwapWithNative,
  formatTokenAmount,
  getBrowserProvider,
  getKiiSigner,
  getWalletBalances,
  parseAmount,
  quoteKiiDexSwapWithNative,
  requireErc20Token
} from "@/lib/chain-transactions";

type WalletState = {
  address: string;
  isKiiChain: boolean;
};

type SwapEstimate = {
  gasPrice: bigint;
  feeKii: string;
  amountOut: bigint;
  amountOutMin: bigint;
  poolFee: number;
  quoteGasEstimate: bigint;
};

export default function SwapPage() {
  const swapTokens = useMemo(() => [...SUPPORTED_TOKENS], []);
  const feeTokens = useMemo(
    () => swapTokens.filter((token): token is Erc20Token => !token.isNative && ["USDC", "USDT"].includes(token.symbol)),
    [swapTokens]
  );
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [selectedFrom, setSelectedFrom] = useState<SupportedToken["id"]>("KII");
  const [selectedTo, setSelectedTo] = useState<SupportedToken["id"]>("USDC");
  const [selectedFeeTokenId, setSelectedFeeTokenId] = useState<Erc20Token["id"]>("USDC");
  const [fromAmount, setFromAmount] = useState("1");
  const [estimateData, setEstimateData] = useState<SwapEstimate | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPreparingGas, setIsPreparingGas] = useState(false);
  const [isAaSwapping, setIsAaSwapping] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [userOpHash, setUserOpHash] = useState<string | null>(null);
  const [approvalHash, setApprovalHash] = useState<string | null>(null);
  const [smartAccount, setSmartAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fromToken = useMemo(
    () => swapTokens.find((token) => token.id === selectedFrom) ?? swapTokens[0],
    [swapTokens, selectedFrom]
  );

  const toToken = useMemo(
    () => swapTokens.find((token) => token.id === selectedTo) ?? swapTokens[1],
    [swapTokens, selectedTo]
  );

  const isConnected = Boolean(wallet?.address && wallet.isKiiChain);
  const feeToken = useMemo(
    () => feeTokens.find((token) => token.id === selectedFeeTokenId) ?? feeTokens[0],
    [feeTokens, selectedFeeTokenId]
  );

  const refreshWallet = useCallback(async () => {
    try {
      const account = await getConnectedKiiAccount();
      if (!account) {
        setWallet(null);
        setBalances({});
        return;
      }

      setWallet({ address: account.address, isKiiChain: account.isKiiChain });

      if (account.isKiiChain) {
        const provider = await getBrowserProvider();
        if (isAccountAbstractionConfigured()) {
          setSmartAccount(await getSmartAccountAddress(account.address, provider));
        }
        const walletBalances = await getWalletBalances(account.address);
        setBalances(
          {
            KII: formatTokenAmount(walletBalances.nativeBalance, 18, 6),
            ...Object.fromEntries(
            walletBalances.tokenBalances.map(({ token, balance }) => [
              token.symbol,
              balance != null ? formatTokenAmount(balance, token.decimals, 6) : "0"
            ])
            )
          }
        );
      } else {
        setBalances({});
        setSmartAccount(null);
      }
    } catch (walletError) {
      setError(walletError instanceof Error ? walletError.message : String(walletError));
    }
  }, []);

  useEffect(() => {
    const handleChange = () => refreshWallet();
    let provider: Awaited<ReturnType<typeof getInjectedEthereumProvider>> = null;
    getInjectedEthereumProvider().then((injectedProvider) => {
      provider = injectedProvider;
      provider?.on?.("accountsChanged", handleChange);
      provider?.on?.("chainChanged", handleChange);
    });
    queueMicrotask(() => {
      refreshWallet();
    });
    return () => {
      provider?.removeListener?.("accountsChanged", handleChange);
      provider?.removeListener?.("chainChanged", handleChange);
    };
  }, [refreshWallet]);

  const handleSwitchTokens = () => {
    setSelectedFrom(selectedTo);
    setSelectedTo(selectedFrom);
    setEstimateData(null);
  };

  const handlePreviewSwap = async () => {
    setError(null);
    setIsPreviewing(true);
    setEstimateData(null);

    try {
      if (!wallet?.address || !wallet.isKiiChain) {
        throw new Error("Connect to KiiChain Testnet before previewing a swap.");
      }

      if (selectedFrom === selectedTo) {
        throw new Error("Select two different assets to build a swap.");
      }

      const provider = await getBrowserProvider();
      const amountIn = parseAmount(fromAmount, fromToken.decimals);
      if (amountIn <= BigInt(0)) {
        throw new Error("Enter an amount greater than zero.");
      }

      const quote = await quoteKiiDexSwapWithNative({
        provider,
        amountIn,
        fromToken,
        toToken
      });

      const amountOutMin = quote.amountOut - (quote.amountOut * BigInt(50)) / BigInt(10_000);
      const gasPrice = await provider
        .send("eth_gasPrice", [])
        .then((value) => BigInt(value as string))
        .catch(() => BigInt(1_000_000_000));
      const feeKii = ethers.formatEther(quote.gasEstimate * gasPrice);

      setEstimateData({
        gasPrice,
        feeKii,
        amountOut: quote.amountOut,
        amountOutMin,
        poolFee: quote.fee,
        quoteGasEstimate: quote.gasEstimate
      });
      setModalOpen(true);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : String(previewError));
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleConfirmSwap = async () => {
    if (!estimateData || !wallet?.address) {
      return;
    }

    setError(null);
    setIsConfirming(true);

    try {
      const signer = await getKiiSigner();
      const amountIn = parseAmount(fromAmount, fromToken.decimals);
      const hashes = await executeKiiDexSwapWithNative({
        signer,
        amountIn,
        amountOutMin: estimateData.amountOutMin,
        fee: estimateData.poolFee,
        fromToken,
        toToken,
        recipient: wallet.address
      });

      setTxHash(hashes.unwrap ?? hashes.swap ?? hashes.wrap ?? null);
      setApprovalHash(hashes.approval ?? null);
      setModalOpen(false);
      await refreshWallet();
    } catch (swapError) {
      setError(swapError instanceof Error ? swapError.message : String(swapError));
    } finally {
      setIsConfirming(false);
    }
  };

  const handlePrepareStableGas = async () => {
    setError(null);
    setIsPreparingGas(true);

    try {
      if (!isAccountAbstractionConfigured()) {
        throw new Error("ERC-4337 environment variables are not configured.");
      }

      const signer = await getKiiSigner();
      const provider = await getBrowserProvider();
      const { op, smartAccount: accountAddress } = await buildSponsoredApprovalUserOperation({
        owner: signer,
        provider,
        feeToken
      });
      setSmartAccount(accountAddress);
      const hash = await sendUserOperation(op);
      setUserOpHash(hash);
      await waitForUserOperationReceipt(hash);
    } catch (prepareError) {
      setError(prepareError instanceof Error ? prepareError.message : String(prepareError));
    } finally {
      setIsPreparingGas(false);
    }
  };

  const handleStableGasSwap = async () => {
    if (!estimateData) {
      return;
    }

    setError(null);
    setIsAaSwapping(true);

    try {
      if (!isAccountAbstractionConfigured()) {
        throw new Error("ERC-4337 environment variables are not configured.");
      }

      if (fromToken.isNative || toToken.isNative) {
        throw new Error("Stablecoin gas swaps use the smart account ERC20 flow. Select WKII instead of native KII.");
      }

      const signer = await getKiiSigner();
      const provider = await getBrowserProvider();
      const amountIn = parseAmount(fromAmount, fromToken.decimals);
      const { op, smartAccount: accountAddress } = await buildStablecoinSwapUserOperation({
        owner: signer,
        provider,
        fromToken: requireErc20Token(fromToken),
        toToken: requireErc20Token(toToken),
        feeToken,
        amountIn,
        amountOutMin: estimateData.amountOutMin,
        poolFee: estimateData.poolFee
      });
      setSmartAccount(accountAddress);
      const hash = await sendUserOperation(op);
      setUserOpHash(hash);
      const receipt = await waitForUserOperationReceipt(hash);
      setTxHash(receipt?.receipt?.transactionHash ?? hash);
      setModalOpen(false);
      await refreshWallet();
    } catch (swapError) {
      setError(swapError instanceof Error ? swapError.message : String(swapError));
    } finally {
      setIsAaSwapping(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Trade"
        title="Swap on KiiDex"
        description="Quote and execute real KiiChain testnet swaps through the deployed KiiDex router."
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Connected wallet</div>
          <div className="flex flex-wrap items-center gap-3">
            <WalletConnectButton />
            <NetworkSwitchButton variant="secondary" className="gap-2" />
            {wallet?.address && (
              <Badge className={wallet.isKiiChain ? "text-teal-100" : "text-amber-100"}>
                {wallet.isKiiChain ? "KiiChain connected" : "Wrong network"}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Swap transaction</CardTitle>
              <CardDescription>Uses KiiDex QuoterV2 and SwapRouter02 on KiiChain Oro.</CardDescription>
            </div>
            <Button variant="ghost" size="icon" aria-label="Swap settings">
              <Settings2 className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <TokenAmountPanel
                label="You pay"
                token={fromToken}
                tokens={swapTokens}
                selected={selectedFrom}
                amount={fromAmount}
                balance={balances[fromToken.symbol]}
                onAmountChange={setFromAmount}
                onTokenChange={(value) => {
                  setSelectedFrom(value as SupportedToken["id"]);
                  setEstimateData(null);
                }}
              />

              <div className="flex flex-col items-center justify-center gap-3">
                <div className="rounded-full border border-white/10 bg-white/[0.04] p-3 text-teal-200">
                  <ArrowDown className="h-4 w-4" />
                </div>
                <Button variant="ghost" size="icon" onClick={handleSwitchTokens} aria-label="Switch tokens">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>

              <TokenAmountPanel
                label="You receive"
                token={toToken}
                tokens={swapTokens}
                selected={selectedTo}
                amount={estimateData ? ethers.formatUnits(estimateData.amountOut, toToken.decimals) : ""}
                balance={balances[toToken.symbol]}
                onAmountChange={() => undefined}
                onTokenChange={(value) => {
                  setSelectedTo(value as SupportedToken["id"]);
                  setEstimateData(null);
                }}
                readOnly
              />
            </div>

            <div className="rounded-3xl bg-white/[0.04] p-4 text-sm">
              <div className="flex justify-between py-2 text-muted-foreground">
                <span>Route</span>
                <span>{fromToken.symbol} {"->"} {toToken.symbol}</span>
              </div>
              <div className="flex justify-between py-2 text-muted-foreground">
                <span>Pool fee</span>
                <span>{estimateData ? `${estimateData.poolFee / 10_000}%` : "Quoted during preview"}</span>
              </div>
              <div className="flex justify-between py-2 text-muted-foreground">
                <span>Network fee</span>
                <span>{estimateData ? `${estimateData.feeKii} KII` : "Quoted during preview"}</span>
              </div>
              <div className="flex justify-between py-2 text-muted-foreground">
                <span>Stable gas</span>
                <span>{isAccountAbstractionConfigured() ? `${feeToken.symbol} via smart account` : "Not configured"}</span>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">ERC-4337 stable gas</div>
                  <div className="text-xs text-muted-foreground">
                    {smartAccount ? `Smart account ${smartAccount.slice(0, 6)}...${smartAccount.slice(-4)}` : "Connect to derive your smart account"}
                  </div>
                </div>
                <select
                  value={selectedFeeTokenId}
                  onChange={(event) => setSelectedFeeTokenId(event.target.value as Erc20Token["id"])}
                  className="h-10 rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-slate-100"
                >
                  {feeTokens.map((token) => (
                    <option key={token.id} value={token.id}>{token.symbol}</option>
                  ))}
                </select>
              </div>
              <Button variant="secondary" className="w-full gap-2" onClick={handlePrepareStableGas} disabled={isPreparingGas || !isConnected || !isAccountAbstractionConfigured()}>
                {isPreparingGas ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Prepare stable gas
              </Button>
            </div>

            {error && (
              <div className="rounded-3xl border border-rose-400/20 bg-rose-950/30 p-4 text-sm text-rose-100">
                {error}
              </div>
            )}

            <Button className="h-12 w-full gap-2" onClick={handlePreviewSwap} disabled={isPreviewing || !isConnected}>
              {isPreviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {isConnected ? "Preview KiiDex swap" : "Connect wallet to preview"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Markets</CardTitle>
            <CardDescription>Live KiiDex testnet assets from the published asset registry.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {swapTokens.map((token) => (
              <div key={token.id} className="flex items-center justify-between rounded-lg bg-white/[0.045] p-3">
                <div>
                  <div className="font-medium">{token.symbol}</div>
                  <div className="text-xs text-muted-foreground">{token.name}</div>
                </div>
                <Badge>{balances[token.symbol] ?? "0"}</Badge>
              </div>
            ))}
            <a
              href="https://kiidex.kiichain.io/"
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm text-teal-100 hover:bg-white/[0.08]"
            >
              Open KiiDex
              <ExternalLink className="h-4 w-4" />
            </a>
          </CardContent>
        </Card>
      </div>

      {(txHash || approvalHash || userOpHash) && (
        <Card className="mt-6">
          <CardContent className="space-y-2 text-sm text-slate-200">
            {approvalHash && <div className="break-all">Approval hash: {approvalHash}</div>}
            {txHash && <div className="break-all">Swap hash: {txHash}</div>}
            {userOpHash && <div className="break-all">UserOp hash: {userOpHash}</div>}
          </CardContent>
        </Card>
      )}

      {modalOpen && estimateData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/95 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold">Confirm KiiDex swap</h2>
                <p className="text-sm text-muted-foreground">Approves the router if needed, then submits the swap.</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="rounded-full border border-white/10 bg-white/5 p-2 text-muted-foreground hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-sm text-muted-foreground">From</div>
                  <div className="mt-2 text-lg font-semibold">{fromAmount} {fromToken.symbol}</div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-sm text-muted-foreground">To</div>
                  <div className="mt-2 text-lg font-semibold">{ethers.formatUnits(estimateData.amountOut, toToken.decimals)} {toToken.symbol}</div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="grid gap-3 text-sm text-muted-foreground">
                  <div className="flex justify-between"><span>Quoted router gas</span><span>{estimateData.quoteGasEstimate.toString()} units</span></div>
                  <div className="flex justify-between"><span>Gas price</span><span>{ethers.formatUnits(estimateData.gasPrice, 9)} Gwei</span></div>
                  <div className="flex justify-between"><span>Minimum received</span><span>{ethers.formatUnits(estimateData.amountOutMin, toToken.decimals)} {toToken.symbol}</span></div>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button className="w-full sm:w-auto gap-2" onClick={handleConfirmSwap} disabled={isConfirming}>
                  {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Confirm swap
                </Button>
                <Button className="w-full sm:w-auto gap-2" onClick={handleStableGasSwap} disabled={isAaSwapping || fromToken.isNative || toToken.isNative}>
                  {isAaSwapping ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Swap with {feeToken.symbol} gas
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TokenAmountPanel({
  label,
  token,
  tokens,
  selected,
  amount,
  balance,
  onAmountChange,
  onTokenChange,
  readOnly = false
}: {
  label: string;
  token: SupportedToken;
  tokens: SupportedToken[];
  selected: string;
  amount: string;
  balance?: string;
  onAmountChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        <span>{balance ?? "0"} {token.symbol}</span>
      </div>
      <div className="flex items-center gap-3">
        <Input
          type={readOnly ? "text" : "number"}
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
          readOnly={readOnly}
          placeholder="0"
          className="h-14 border-0 bg-transparent px-0 text-3xl font-semibold focus-visible:ring-0"
        />
        <select
          value={selected}
          onChange={(event) => onTokenChange(event.target.value)}
          className="h-14 min-w-[7rem] rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-slate-100"
        >
          {tokens.map((item) => (
            <option key={item.id} value={item.id}>
              {item.symbol}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
