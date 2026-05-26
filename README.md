# KiiFlow

KiiFlow is a fintech Web3 frontend for KiiChain Testnet Oro. It combines a clean Next.js dashboard with real KiiChain testnet integrations, KiiDex asset support, and an ERC-4337-style stablecoin gas experience.

Live app:

```txt
https://kiiflow.vercel.app/dashboard
```

Public bundler RPC:

```txt
https://kiiflow.onrender.com/rpc
```

## What It Does

- Connects MetaMask to KiiChain Testnet Oro.
- Reads real KII and KiiDex token balances.
- Supports real KiiDex swap flows.
- Supports token transfers.
- Supports Lock/Earn positions through a deployed LockVault.
- Supports ERC-4337 stablecoin gas UX using USDC/USDT fee payment.
- Uses a self-hosted ERC-4337 bundler compatible with the deployed EntryPoint.

The app does not use mocked frontend blockchain state for the main flows.

## Core Stack

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui-style components
- Framer Motion
- ethers.js
- Hardhat
- Solidity
- OpenZeppelin
- ERC-4337 EntryPoint-compatible paymaster flow

## Deployed KiiChain Testnet Contracts

```txt
EntryPoint:                 0xC3412374BEf9Ea5De79022454c1802A5a58fB2B3
StablecoinPaymaster:        0x02a7Ac6CE7540aE1D89e49d88720F20932856b6c
TreasuryManager:            0xf38D24BFdBfde67EB31c374C668B700CA01690D0
TokenWhitelist:             0x1e6AE144fBD6afBD140Ff450b6252AEb5088F390
OracleManager:              0xcF737B73628a5038126E0f3Bd95b8964C6d4AaC2
Simple4337AccountFactory:   0xE11c44438f0d58797DB7fA0b4063715703A1be5d
LockVault:                  0x6cA8c9450BA78e18da654d6774eA791050CEeEd4
```

## KiiChain Testnet Assets

Asset references come from the KiiChain testnet registry:

```txt
https://github.com/KiiChain/testnets/blob/main/testnet_oro/kiidex/assets.json
```

Common assets used by KiiFlow:

```txt
WKII: 0xd51e7187e54a4A22D790f8bbDdd9B54b891Bc920
USDC: 0xb72FfA8E8079365c1890948464B542E42EEC892B
USDT: 0x1A9992f48dE81C57D38147F3c573E84575021de6
WBTC: 0x7806BbEf4F5aba0Bd0e96139EeEb2DF88E7839e5
BRL:  0x83ddda4E424714a873ffB3c74DeC3375fF46Baec
```

## Local Setup

Install dependencies:

```bash
npm install
```

Create an environment file:

```bash
cp .env.example .env
```

Fill in the required values in `.env`. Never commit private keys or mnemonics.

Run the frontend:

```bash
npm run dev
```

Open:

```txt
http://localhost:3000
```

## Required Frontend Environment Variables

For Vercel, add these public variables:

```env
NEXT_PUBLIC_ENTRY_POINT_ADDRESS=0xC3412374BEf9Ea5De79022454c1802A5a58fB2B3
NEXT_PUBLIC_BUNDLER_RPC_URL=https://kiiflow.onrender.com/rpc
NEXT_PUBLIC_PAYMASTER_ADDRESS=0x02a7Ac6CE7540aE1D89e49d88720F20932856b6c
NEXT_PUBLIC_TREASURY_MANAGER_ADDRESS=0xf38D24BFdBfde67EB31c374C668B700CA01690D0
NEXT_PUBLIC_ACCOUNT_FACTORY_ADDRESS=0xE11c44438f0d58797DB7fA0b4063715703A1be5d
NEXT_PUBLIC_USER_OPERATION_TTL_SECONDS=86400
NEXT_PUBLIC_USDC_ADDRESS=0xb72FfA8E8079365c1890948464B542E42EEC892B
NEXT_PUBLIC_USDT_ADDRESS=0x1A9992f48dE81C57D38147F3c573E84575021de6
NEXT_PUBLIC_LOCK_VAULT_ADDRESS=0x6cA8c9450BA78e18da654d6774eA791050CEeEd4
```

## ERC-4337 Stablecoin Gas Notes

KiiFlow supports a stablecoin gas flow where users can select USDC or USDT as the fee token. The paymaster still needs native KII deposited into EntryPoint because the bundler ultimately pays native gas to submit `handleOps`.

Important user flow:

1. Connect MetaMask on KiiChain Testnet Oro.
2. Derive the smart account in the app.
3. Fund the smart account with the token being used.
4. Click the prepare stable gas action to approve `TreasuryManager`.
5. Submit Send, Swap, or Lock through ERC-4337 stablecoin gas.

For ERC20 smart-account swaps, use WKII instead of native KII. Native KII is not an ERC20 token, so it cannot be approved and routed through the same stablecoin gas smart-account flow.

## Paymaster Operations

Check paymaster readiness:

```bash
npm run paymaster:check
```

Top up the paymaster EntryPoint deposit:

```bash
npm run paymaster:topup
```

Check the configured depositor wallet balance:

```bash
npx hardhat run --network kiiChainTestnet scripts/check-depositor-balance.ts
```

## Bundler

KiiFlow uses a self-hosted Transeptor bundler on Render.

Render service settings:

```txt
Runtime: Docker
Root Directory: bundler/render
Dockerfile Path: Dockerfile
```

Required Render variables:

```env
KII_RPC_URL=https://json-rpc.uno.sentry.testnet.v3.kiivalidator.com/
BUNDLER_MIN_BALANCE=0.01
TRANSEPTOR_ENTRYPOINT_ADDRESS=0xC3412374BEf9Ea5De79022454c1802A5a58fB2B3
TRANSEPTOR_BENEFICIARY=YOUR_FUNDED_BUNDLER_WALLET_ADDRESS
TRANSEPTOR_MNEMONIC=YOUR_BUNDLER_WALLET_MNEMONIC
TRANSEPTOR_LOG_LEVEL=info
TRANSEPTOR_RECEIPT_LOOKBACK_BLOCKS=9000
TRANSEPTOR_MAX_LOG_BLOCK_RANGE=9000
```

Test the bundler:

```bash
curl -X POST https://kiiflow.onrender.com/rpc \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_supportedEntryPoints","params":[]}'
```

Expected result includes:

```txt
0xC3412374BEf9Ea5De79022454c1802A5a58fB2B3
```

## Development Commands

```bash
npm run dev
npm run lint
npm run build
npm run compile
npm run test
```

## Security

- Do not commit `.env`, private keys, mnemonics, or funded wallet secrets.
- Use dedicated testnet wallets for deployment, bundler operation, and settlement.
- Keep the paymaster EntryPoint deposit funded before demos or judging.
- Rotate any secret that has ever been shared publicly.
