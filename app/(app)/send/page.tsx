"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { ArrowRight, Clock3, ContactRound, Loader2, ScanLine, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { NetworkSwitchButton } from "@/components/network-switch-button";
import { getConnectedKiiAccount, getInjectedEthereumProvider } from "@/lib/kii-wallet";
import {
  SUPPORTED_TOKENS,
  SupportedToken,
  formatTokenAmount,
  getKiiSigner,
  getWalletBalances,
  parseAmount,
  transferToken
} from "@/lib/chain-transactions";

const recipients = ["Avery Stone", "Mina Patel", "River Chen"];

export default function SendPage() {
  const [address, setAddress] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("1");
  const [selectedTokenId, setSelectedTokenId] = useState<SupportedToken["id"]>("USDC");
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [isKiiChain, setIsKiiChain] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");

  const token = useMemo(
    () => SUPPORTED_TOKENS.find((item) => item.id === selectedTokenId) ?? SUPPORTED_TOKENS[0],
    [selectedTokenId]
  );

  const refreshWallet = useCallback(async () => {
    const account = await getConnectedKiiAccount();
    if (!account) {
      setAddress("");
      setIsKiiChain(false);
      setBalances({});
      return;
    }

    setAddress(account.address);
    setIsKiiChain(account.isKiiChain);

    if (account.isKiiChain) {
      const walletBalances = await getWalletBalances(account.address);
      const mapped = Object.fromEntries(
        walletBalances.tokenBalances.map(({ token: item, balance }) => [
          item.symbol,
          balance != null ? formatTokenAmount(balance, item.decimals, 6) : "0"
        ])
      );
      mapped.KII = formatTokenAmount(walletBalances.nativeBalance, 18, 6);
      setBalances(mapped);
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
    queueMicrotask(refreshWallet);
    return () => {
      provider?.removeListener?.("accountsChanged", handleChange);
      provider?.removeListener?.("chainChanged", handleChange);
    };
  }, [refreshWallet]);

  async function handleTransfer() {
    setError("");
    setTxHash("");
    setIsSending(true);

    try {
      if (!address || !isKiiChain) {
        throw new Error("Connect and switch to KiiChain Testnet Oro first.");
      }

      if (!ethers.isAddress(recipient)) {
        throw new Error("Enter a valid recipient address.");
      }

      const signer = await getKiiSigner();
      const value = parseAmount(amount, token.decimals);
      if (value <= BigInt(0)) {
        throw new Error("Enter an amount greater than zero.");
      }

      const tx = await transferToken({ signer, token, to: recipient, amount: value });
      setTxHash(tx.hash);
      await tx.wait();
      await refreshWallet();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : String(sendError));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Transfer"
        title="Move funds on KiiChain"
        description="Send real KII or KiiDex ERC20 assets from your connected MetaMask wallet."
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <WalletConnectButton />
        <NetworkSwitchButton variant="secondary" />
        {address && <Badge>{isKiiChain ? "KiiChain connected" : "Wrong network"}</Badge>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Send Transfer</CardTitle>
            <CardDescription>Submits a real wallet transaction through ethers.js.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-2 block text-sm text-muted-foreground">Recipient</label>
              <div className="flex gap-2">
                <Input placeholder="0x..." value={recipient} onChange={(event) => setRecipient(event.target.value)} />
                <Button variant="outline" size="icon" aria-label="Scan address">
                  <ScanLine className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div>
                <label className="mb-2 block text-sm text-muted-foreground">Amount</label>
                <Input value={amount} onChange={(event) => setAmount(event.target.value)} className="h-14 text-3xl font-semibold" />
              </div>
              <div>
                <label className="mb-2 block text-sm text-muted-foreground">Asset</label>
                <select
                  value={selectedTokenId}
                  onChange={(event) => setSelectedTokenId(event.target.value as SupportedToken["id"])}
                  className="h-14 min-w-28 rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-slate-100"
                >
                  {SUPPORTED_TOKENS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.symbol}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-lg bg-white/[0.045] p-4 text-sm">
              <div className="flex justify-between py-1 text-muted-foreground"><span>Balance</span><span>{balances[token.symbol] ?? "0"} {token.symbol}</span></div>
              <div className="flex justify-between py-1 text-muted-foreground"><span>Network</span><span>KiiChain Oro</span></div>
              <div className="flex justify-between py-1 text-muted-foreground"><span>Execution</span><span>MetaMask + ethers.js</span></div>
            </div>

            {error && <div className="rounded-lg border border-rose-400/20 bg-rose-950/30 p-3 text-sm text-rose-100">{error}</div>}
            {txHash && <div className="break-all rounded-lg bg-white/[0.045] p-3 text-sm">Transaction hash: {txHash}</div>}

            <Button className="h-12 w-full gap-2" onClick={handleTransfer} disabled={isSending || !isKiiChain}>
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Send real transfer
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Saved Recipients</CardTitle>
              <CardDescription>UI shortcuts; transactions still require wallet confirmation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recipients.map((name) => (
                <div key={name} className="flex items-center justify-between rounded-lg bg-white/[0.045] p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.08]">
                      <ContactRound className="h-4 w-4 text-teal-200" />
                    </div>
                    <div>
                      <div className="font-medium">{name}</div>
                      <div className="text-xs text-muted-foreground">Add a real address before sending</div>
                    </div>
                  </div>
                  <Badge>Local</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transfer Controls</CardTitle>
              <CardDescription>Wallet-native safeguards.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-lg bg-white/[0.045] p-4">
                <ShieldCheck className="mb-3 h-5 w-5 text-teal-200" />
                <div className="font-medium">Wallet confirmation</div>
                <div className="mt-1 text-sm text-muted-foreground">Every transfer is signed in MetaMask.</div>
              </div>
              <div className="rounded-lg bg-white/[0.045] p-4">
                <Clock3 className="mb-3 h-5 w-5 text-teal-200" />
                <div className="font-medium">Testnet finality</div>
                <div className="mt-1 text-sm text-muted-foreground">Transaction hash appears immediately after submission.</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
