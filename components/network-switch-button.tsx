"use client";

import { useState } from "react";
import { Loader2, RadioTower } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getWalletErrorMessage, switchToKiiChain } from "@/lib/kii-wallet";

export function NetworkSwitchButton({
  variant = "outline",
  className
}: {
  variant?: "default" | "outline" | "ghost" | "secondary";
  className?: string;
}) {
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSwitch() {
    setError(null);
    setIsSwitching(true);

    try {
      await switchToKiiChain();
    } catch (switchError) {
      setError(getWalletErrorMessage(switchError));
    } finally {
      setIsSwitching(false);
    }
  }

  return (
    <div className="relative">
      <Button variant={variant} className={className} onClick={handleSwitch} disabled={isSwitching}>
        {isSwitching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RadioTower className="h-4 w-4" />}
        KiiChain Testnet
      </Button>
      {error && (
        <div className="absolute right-0 top-12 z-30 w-72 rounded-lg border border-red-300/20 bg-red-950/90 p-3 text-xs text-red-100 shadow-2xl backdrop-blur">
          {error}
        </div>
      )}
    </div>
  );
}
