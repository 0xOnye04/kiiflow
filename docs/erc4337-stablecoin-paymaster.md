# KiiFlow ERC-4337 Stablecoin Paymaster

This implementation uses the official `@account-abstraction/contracts` EntryPoint v0.8 flow:

`UserOperation -> Bundler -> EntryPoint.handleOps -> Simple4337Account.validateUserOp -> StablecoinPaymaster.validatePaymasterUserOp -> execution -> StablecoinPaymaster.postOp`

## Contracts

- `StablecoinPaymaster.sol`: ERC-4337 paymaster with `validatePaymasterUserOp`, `postOp`, sponsor mode, token-pay mode, and v0.8 `paymasterAndData`.
- `TokenWhitelist.sol`: owner-managed USDC/USDT whitelist, max fee per op, and max slippage bps.
- `OracleManager.sol`: token-per-KII pricing with staleness checks.
- `TreasuryManager.sol`: collects stablecoin fees, converts through a settlement router, and refills the paymaster EntryPoint deposit in KII.
- `Simple4337Account.sol`: minimal smart account compatible with EntryPoint v0.8 and browser `signMessage` signatures.

## Required Testnet Environment

```bash
KII_RPC_URL=https://json-rpc.uno.sentry.testnet.v3.kiivalidator.com/
DEPLOYER_PRIVATE_KEY=0x...
ENTRY_POINT_ADDRESS=0xExistingEntryPointOnKiiChain
DEPLOY_ENTRYPOINT=false
BUNDLER_RPC_URL=https://your-real-erc4337-bundler.example
USDC_ADDRESS=0xRealKiiChainUSDC
USDT_ADDRESS=0xRealKiiChainUSDT
SETTLEMENT_OPERATOR_ADDRESS=0x...
SETTLEMENT_ROUTER_ADDRESS=0x...
PAYMASTER_DEPOSIT_KII=0.1
```

Deploy:

```bash
npm run deploy:kii
```

The deploy script writes deployment metadata to `deployments/kiiChainTestnet.json`.

The KiiChain testnet deployment path is intentionally real-only. It fails before deploying app contracts when:

- `USDC_ADDRESS` / `USDT_ADDRESS` are empty, placeholders, have no bytecode, do not expose ERC20 metadata, or do not report a matching symbol.
- `ENTRY_POINT_ADDRESS` is empty and `DEPLOY_ENTRYPOINT` is not `true`.
- `BUNDLER_RPC_URL` does not respond to `eth_chainId` and `eth_supportedEntryPoints`, or does not support the selected EntryPoint.
- `SETTLEMENT_ROUTER_ADDRESS` is provided but has no deployed bytecode.

If no official stablecoin deployment is configured, the script stops with:

```text
no native stablecoin deployment available on chain
```

## Frontend Flow

Users need stablecoin allowance from their smart account to `TreasuryManager` before token-pay mode can validate. For a native-token-free UX, do this once using sponsor mode.

```ts
import {
  PaymasterFeeMode,
  buildEntryPointUserOperation,
  withUserOperationSignature,
  submitUserOperation
} from "@/lib/paymaster-sdk";

const approveData = usdc.interface.encodeFunctionData("approve", [treasuryManager, maxAllowance]);

const approvalOp = await buildEntryPointUserOperation({
  account: smartAccount,
  target: usdcAddress,
  data: approveData,
  feeToken: usdcAddress,
  entryPoint,
  paymaster,
  provider,
  maxFeePerGas,
  maxPriorityFeePerGas,
  mode: PaymasterFeeMode.Sponsor
});

const signedApproval = await withUserOperationSignature({ entryPoint, op: approvalOp, owner: signer });
await submitUserOperation({ entryPoint, op: signedApproval, beneficiary, bundler });
```

After allowance exists, submit transfer/swap ops in token-pay mode:

```ts
const transferData = usdc.interface.encodeFunctionData("transfer", [recipient, amount]);

const transferOp = await buildEntryPointUserOperation({
  account: smartAccount,
  target: usdcAddress,
  data: transferData,
  feeToken: usdcAddress,
  entryPoint,
  paymaster,
  provider,
  maxFeePerGas,
  maxPriorityFeePerGas,
  mode: PaymasterFeeMode.TokenPay
});

const signedTransfer = await withUserOperationSignature({ entryPoint, op: transferOp, owner: signer });
await submitUserOperation({ entryPoint, op: signedTransfer, beneficiary, bundler });
```

For swaps, replace `target` and `data` with the swap router contract and encoded swap call. The paymaster still collects USDC/USDT in `postOp`, including when execution reverts.

## Settlement

Run the settlement bot to convert collected USDC/USDT into KII and refill the EntryPoint deposit:

```bash
SETTLEMENT_OPERATOR_PRIVATE_KEY=0x... \
PAYMASTER_ADDRESS=0x... \
TREASURY_MANAGER_ADDRESS=0x... \
SETTLEMENT_ROUTER_ADDRESS=0x... \
FEE_TOKEN_ADDRESSES=0xUSDC,0xUSDT \
npx ts-node scripts/settlement-bot.ts
```
