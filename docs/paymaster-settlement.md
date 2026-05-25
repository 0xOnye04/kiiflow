# KiiFlow Paymaster Settlement Router

Option B keeps the conversion on chain.

Flow:

1. User selects a stablecoin fee token.
2. Bundler submits the `UserOperation` through `EntryPoint.handleOps`.
3. `StablecoinPaymaster.validatePaymasterUserOp` confirms fee token, cap, balance, and validity window.
4. EntryPoint spends the paymaster's native KII deposit to pay gas.
5. `StablecoinPaymaster.postOp` charges the user's smart account in stablecoin.
6. Stablecoins land in `StablecoinSettlementVault`.
7. Settlement operator calls `convertAndRefill(router, token, amountIn, minKiiOut)`.
8. The router swaps stablecoin to KII and sends KII back to the vault.
9. The vault immediately deposits received KII into EntryPoint for the paymaster.

Environment:

```text
KII_RPC_URL=
SETTLEMENT_OPERATOR_PRIVATE_KEY=
PAYMASTER_ADDRESS=
SETTLEMENT_ROUTER_ADDRESS=
FEE_TOKEN_ADDRESSES=0xUSDC,0xUSDT
MIN_KII_OUT=0
```

Run:

```powershell
npx ts-node scripts/settlement-bot.ts
```

Production notes:

- `SETTLEMENT_ROUTER_ADDRESS` should be a vetted KiiChain DEX/aggregator adapter.
- Use `MIN_KII_OUT` to protect against liquidity shocks and conversion slippage.
- Keep a separate monitor for paymaster EntryPoint deposit thresholds.
- Disable a fee token if its router route becomes illiquid or stale.
