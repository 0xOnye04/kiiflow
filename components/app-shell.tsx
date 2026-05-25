"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownUp,
  Bell,
  Coins,
  Home,
  LockKeyhole,
  RadioTower,
  Search,
  Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NetworkSwitchButton } from "@/components/network-switch-button";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/swap", label: "Swap / Trade", icon: ArrowDownUp },
  { href: "/send", label: "Send Transfer", icon: Send },
  { href: "/earn", label: "Lock / Earn", icon: LockKeyhole }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-white/10 bg-black/20 px-4 py-5 backdrop-blur-2xl lg:block">
        <Link href="/dashboard" className="mb-8 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-glow">
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-normal">KiiFlow</div>
            <div className="text-xs text-muted-foreground">Web3 finance OS</div>
          </div>
        </Link>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition",
                  active && "bg-white/10 text-foreground shadow-sm",
                  !active && "hover:bg-white/[0.07] hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-5 left-4 right-4 rounded-lg border border-teal-300/15 bg-teal-300/10 p-4">
          <div className="mb-3 flex items-center gap-2">
            <RadioTower className="h-4 w-4 text-teal-200" />
            <div className="text-sm font-medium">Network</div>
          </div>
          <div className="text-lg font-semibold">KiiChain Testnet Oro</div>
          <p className="mt-1 text-xs text-muted-foreground">Chain ID 1336</p>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-background/55 px-4 py-3 backdrop-blur-2xl sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Coins className="h-5 w-5" />
              </div>
              <span className="font-semibold">KiiFlow</span>
            </Link>

            <div className="hidden min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.055] px-3 py-2 text-sm text-muted-foreground md:flex">
              <Search className="h-4 w-4" />
              Search assets, wallets, transactions
            </div>

            <div className="flex items-center gap-2">
              <Badge className="hidden border-teal-300/20 bg-teal-300/10 text-teal-100 md:inline-flex">
                KiiChain Testnet Oro
              </Badge>
              <div className="hidden sm:block">
                <NetworkSwitchButton className="gap-2" />
              </div>
              <Button variant="ghost" size="icon" aria-label="Notifications">
                <Bell className="h-4 w-4" />
              </Button>
              <WalletConnectButton />
            </div>
          </div>

          <nav className="mt-3 flex gap-2 overflow-x-auto lg:hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground",
                    active && "bg-white/10 text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
      </div>
    </div>
  );
}
