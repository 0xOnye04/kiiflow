"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ethers } from "ethers";
import {
  ArrowRight,
  ArrowRightLeft,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Fuel,
  Loader2,
  Sparkles,
  Store,
  TriangleAlert
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { estimateFee, EstimateData, FEE_TOKENS, FeeToken, ERC20_ABI, parseAmount, safeEstimateGas } from "@/lib/fee-estimation";
import { getInjectedEthereumProvider } from "@/lib/kii-wallet";

async function getSigner() {
  const injectedProvider = await getInjectedEthereumProvider();

  if (!injectedProvider) {
    throw new Error("No EVM wallet found. Install MetaMask or another browser wallet.");
  }
  const provider = new ethers.BrowserProvider(injectedProvider, "any");
  return provider.getSigner();
}

function formatFixed(value: string | number, decimals = 6) {
  const maxDigits = Number.isFinite(Number(decimals)) ? Math.max(0, Math.min(20, Number(decimals))) : 6;
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return String(value ?? "0");
  }

  return numericValue.toLocaleString(undefined, {
    minimumFractionDigits: maxDigits > 0 ? 2 : 0,
    maximumFractionDigits: maxDigits
  });
}

export function FeeAbstractionPanel({ walletAddress, isKiiChain }: { walletAddress: string | null; isKiiChain: boolean }) {
  const [selectedTokenId, setSelectedTokenId] = useState<FeeToken["id"]>("KII");
  const [recipientInput, setRecipientInput] = useState<string>(walletAddress ?? "");
  const [amount, setAmount] = useState("0.05");
  const [estimate, setEstimate] = useState<EstimateData | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const recipient = recipientInput || walletAddress || "";

  const selectedToken = useMemo(
    () => FEE_TOKENS.find((token) => token.id === selectedTokenId) ?? FEE_TOKENS[0],
    [selectedTokenId]
  );

  const isReadyForEstimate = Boolean(walletAddress && isKiiChain && typeof window !== "undefined");

  useEffect(() => {
    if (!isReadyForEstimate) {
      return;
    }

    let cancelled = false;
    async function refreshEstimate() {
      setIsEstimating(true);
      setError(null);

      try {
        const signer = await getSigner();
        const account = await signer.getAddress();
        const recipientAddress = ethers.isAddress(recipient) ? ethers.getAddress(recipient) : account;
        const provider = signer.provider;

        if (!provider) {
          throw new Error("Unable to connect to the KiiChain provider.");
        }

        const estimateData = await estimateFee({
          signer,
          provider,
          selectedToken,
          recipientAddress,
          amount,
          account
        });

        if (!cancelled) {
          setEstimate(estimateData);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setEstimate(null);
      } finally {
        if (!cancelled) {
          setIsEstimating(false);
        }
      }
    }

    refreshEstimate();
    return () => {
      cancelled = true;
    };
  }, [recipient, amount, selectedToken, selectedTokenId, walletAddress, isKiiChain, isReadyForEstimate]);

  const summaryLabel = selectedToken.isNative ? "Native KII fee" : "Token fee route";
  const statusText = selectedToken.isNative
    ? "Native gas mode"
    : estimate?.routeAvailable && estimate.paymasterAvailable
    ? "Gas Abstracted"
    : "Fallback route active";
  const badgeClass = selectedToken.isNative
    ? "text-emerald-100"
    : estimate?.routeAvailable && estimate.paymasterAvailable
    ? "text-teal-100"
    : "text-amber-100";

  const flowItems = [
    {
      title: "Token selection",
      description: `${selectedToken.label} gas source chosen for this transaction`,
      icon: CircleDollarSign
    },
    {
      title: "Route validation",
      description: estimate?.paymasterAvailable ? "Paymaster quote verified on chain" : "Native fallback route ready",
      icon: ArrowRightLeft
    },
    {
      title: "Final settlement",
      description: selectedToken.isNative ? "KII gas settled directly" : "Settlement bot refills KII behind the scenes",
      icon: Sparkles
    }
  ];

  const optionAItems = [
    {
      title: "EntryPoint pays KII",
      description: "The paymaster's native KII deposit covers gas for the bundler and validators.",
      icon: Fuel
    },
    {
      title: `${selectedToken.symbol} collected`,
      description: selectedToken.isNative
        ? "Native KII mode does not use TreasuryManager token settlement."
        : `${selectedToken.symbol} fees are collected into TreasuryManager after postOp.`,
      icon: Store
    },
    {
      title: "Router settles",
      description: "The operator swaps collected stablecoin to KII on chain and refills the paymaster deposit.",
      icon: Bot
    }
  ];

  const displayEstimate = isReadyForEstimate ? estimate : null;
  const canOpenModal = Boolean(displayEstimate && !error && isReadyForEstimate);

  async function handleRequestSignature() {
    if (!displayEstimate || !isReadyForEstimate) {
      return;
    }

    setConfirming(true);
    setConfirmed(false);

    try {
      const signer = await getSigner();
      const account = await signer.getAddress();
      const recipientAddress = ethers.isAddress(recipient) ? ethers.getAddress(recipient) : account;
      const provider = signer.provider;
      if (!provider) {
        throw new Error("Unable to connect to the chain provider.");
      }
      const finalAmount = selectedToken.isNative
        ? parseAmount(amount, 18)
        : parseAmount(amount, displayEstimate.tokenDecimals ?? 6);

      if (!selectedToken.isNative && selectedToken.address) {
        const tokenAddress = selectedToken.address.toLowerCase();
        if (!ethers.isAddress(tokenAddress)) {
          throw new Error("Selected fee token address is invalid for this chain.");
        }
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        const txData = contract.interface.encodeFunctionData("transfer", [
          recipientAddress,
          finalAmount > 0 ? finalAmount : parseAmount("1", displayEstimate.tokenDecimals ?? 6)
        ]);
        await safeEstimateGas(signer, { to: tokenAddress, data: txData });
      } else {
        await safeEstimateGas(signer, { to: recipientAddress, value: finalAmount }, BigInt(21000));
      }

      setConfirmed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Fee abstraction</CardTitle>
          <CardDescription>
            Select a gas token, inspect the route, and preview fee settlement with real chain estimates.
          </CardDescription>
        </div>
        <Badge className={cn(badgeClass, "whitespace-nowrap")}>{statusText}</Badge>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Gas token</p>
                  <h3 className="text-lg font-semibold">Choose your fee settlement currency</h3>
                </div>
                <Badge className="text-teal-100">{selectedToken.label}</Badge>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {FEE_TOKENS.map((token) => (
                  <button
                    key={token.id}
                    type="button"
                    className={cn(
                      "rounded-3xl border px-4 py-3 text-left transition",
                      token.id === selectedTokenId
                        ? "border-teal-300/40 bg-teal-500/10 ring-1 ring-teal-200/20"
                        : "border-white/10 bg-white/[0.02] hover:border-white/20"
                    )}
                    onClick={() => setSelectedTokenId(token.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{token.label}</p>
                        <p className="text-xs text-muted-foreground">{token.symbol}</p>
                      </div>
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-sm font-semibold">
                        {token.symbol[0]}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
              <div>
                <label className="mb-2 block text-sm text-muted-foreground">Recipient</label>
                <Input
                  value={recipient}
                  placeholder="0x..."
                  onChange={(event) => setRecipientInput(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-muted-foreground">Amount</label>
                <Input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.05"
                />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Estimator</p>
                <h3 className="text-lg font-semibold">Fee preview</h3>
              </div>
              {isEstimating ? <Loader2 className="h-5 w-5 animate-spin text-teal-200" /> : <CheckCircle2 className="h-5 w-5 text-teal-200" />}
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="grid gap-2 rounded-3xl bg-slate-950/50 p-4">
                <div className="flex items-center justify-between text-muted-foreground"><span>Gas units</span><span>{estimate ? estimate.gasEstimate.toString() : "-"}</span></div>
                <div className="flex items-center justify-between text-muted-foreground"><span>Gas price</span><span>{estimate ? `${formatFixed(ethers.formatUnits(estimate.gasPrice, 9), 3)} Gwei` : "-"}</span></div>
                <div className="flex items-center justify-between text-white"><span>{summaryLabel}</span><span>{estimate ? `${formatFixed(estimate.nativeFeeKii)} KII` : "-"}</span></div>
                {!selectedToken.isNative && (
                  <div className="flex items-center justify-between text-muted-foreground"><span>Paymaster token quote</span><span>{estimate?.paymasterTokenFee ? `${formatFixed(estimate.paymasterTokenFee)} ${selectedToken.symbol}` : "-"}</span></div>
                )}
                {!selectedToken.isNative && (
                  <div className="flex items-center justify-between text-muted-foreground"><span>Paymaster deposit</span><span>{estimate?.paymasterDepositKii ? `${formatFixed(estimate.paymasterDepositKii)} KII` : "-"}</span></div>
                )}
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 text-sm">
                <p className="font-semibold">Equivalent fee conversions</p>
                <div className="mt-3 space-y-2 text-muted-foreground">
                  <div className="flex justify-between"><span>KII network cost</span><span>{estimate ? `${formatFixed(estimate.nativeFeeKii)} KII` : "-"}</span></div>
                  <div className="flex justify-between"><span>{selectedToken.label} Paymaster quote</span><span>{selectedToken.isNative ? "Direct" : estimate?.paymasterTokenFee ? `${formatFixed(estimate.paymasterTokenFee)} ${selectedToken.symbol}` : "Pending"}</span></div>
                  {estimate?.tokenBalance !== undefined && (
                    <div className="flex justify-between"><span>{selectedToken.label} balance</span><span>{estimate.tokenBalance} {selectedToken.symbol}</span></div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-3xl border border-rose-400/20 bg-rose-950/30 p-4 text-sm text-rose-100">
            <div className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        <div className="rounded-3xl border border-teal-300/15 bg-teal-300/[0.06] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Badge className="border-teal-300/20 bg-teal-300/10 text-teal-100">Option B</Badge>
              <h3 className="mt-3 text-lg font-semibold">On-chain conversion and refill</h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                Users pay with a selected token. EntryPoint spends KII from the deployed Paymaster deposit, while collected token fees are routed through TreasuryManager for KII refill.
              </p>
            </div>
            <Badge className={selectedToken.isNative ? "text-emerald-100" : "text-teal-100"}>
              {selectedToken.isNative ? "Direct KII" : `${selectedToken.symbol} -> KII`}
            </Badge>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {optionAItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-teal-500/10 p-2 text-teal-200">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
            <div className="rounded-2xl bg-slate-950/40 p-3">
              <p className="text-muted-foreground">Paymaster deposit</p>
              <p className="mt-1 font-semibold">KII funded</p>
            </div>
            <div className="rounded-2xl bg-slate-950/40 p-3">
              <p className="text-muted-foreground">User fee token</p>
              <p className="mt-1 font-semibold">{selectedToken.symbol}</p>
            </div>
            <div className="rounded-2xl bg-slate-950/40 p-3">
              <p className="text-muted-foreground">Collection target</p>
              <p className="mt-1 font-semibold">TreasuryManager</p>
            </div>
            <div className="rounded-2xl bg-slate-950/40 p-3">
              <p className="text-muted-foreground">Refill actor</p>
              <p className="mt-1 font-semibold">Operator + router</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            {flowItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * index }}
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-teal-500/10 p-3 text-teal-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Fallback liquidity routing</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {estimate?.warnings.length
                  ? estimate.warnings[0]
                  : selectedToken.isNative
                  ? "Native KII gas settlement is ready for current chain conditions."
                  : "Token abstraction route estimated with live token and gas checks."
                }
              </p>
            </div>
            <Button
              variant="default"
              className="mt-4 w-full sm:mt-0 sm:w-auto gap-2"
              onClick={() => setIsModalOpen(true)}
              disabled={!canOpenModal || isEstimating}
            >
              {isEstimating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Review transaction
            </Button>
          </div>
        </div>
      </CardContent>

      <AnimatePresence>
        {isModalOpen && estimate && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/95 shadow-2xl"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
                <div>
                  <h2 className="text-xl font-semibold">Confirm fee abstraction</h2>
                  <p className="text-sm text-muted-foreground">Review the live chain estimate and route status before proceeding.</p>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-muted-foreground hover:bg-white/10"
                  onClick={() => setIsModalOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="space-y-6 px-6 py-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm text-muted-foreground">Gas token</p>
                    <p className="mt-2 text-lg font-semibold">{selectedToken.label}</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm text-muted-foreground">Selected route</p>
                    <p className="mt-2 text-lg font-semibold">{selectedToken.isNative ? "Direct KII" : estimate.paymasterAvailable ? "Paymaster quoted" : "Fallback native route"}</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm text-muted-foreground">Estimated gas</p>
                    <p className="mt-2 text-lg font-semibold">{formatFixed(estimate.gasEstimate.toString(), 0)} units</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm text-muted-foreground">Native fee</p>
                    <p className="mt-2 text-lg font-semibold">{formatFixed(estimate.nativeFeeKii)} KII</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm text-muted-foreground">Paymaster token quote</p>
                    <p className="mt-2 text-lg font-semibold">{estimate.paymasterTokenFee ? `${formatFixed(estimate.paymasterTokenFee)} ${selectedToken.symbol}` : "N/A"}</p>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm text-muted-foreground">Recipient</p>
                  <p className="mt-2 text-lg font-semibold break-all">{recipient}</p>
                  <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <div>
                      <p>Amount</p>
                      <p className="mt-1 text-white">{amount} {selectedToken.label}</p>
                    </div>
                    <div>
                      <p>Balance</p>
                      <p className="mt-1 text-white">{estimate.tokenBalance ?? "—"} {selectedToken.label}</p>
                    </div>
                  </div>
                </div>

                {estimate.warnings.length > 0 && (
                  <div className="rounded-3xl border border-amber-400/20 bg-amber-950/30 p-4 text-sm text-amber-100">
                    <p className="font-semibold">Route warning</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {estimate.warnings.map((warning: string) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 border-t border-white/10 px-6 py-4 sm:flex-row sm:justify-between">
                <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button className="w-full sm:w-auto gap-2" onClick={handleRequestSignature} disabled={confirming}>
                  {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {confirmed ? "Estimate confirmed" : "Confirm preview"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
