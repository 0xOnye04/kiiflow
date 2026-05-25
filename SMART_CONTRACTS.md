# KiiFlow Smart Contracts

Real Solidity contracts for token swapping and locking on KiiChain testnet.

## Contracts

### SimpleSwap.sol
Token swap contract with fee abstraction:
- Swap between any two configured ERC20 tokens
- Configurable fee basis points (bps)
- Owner sets exchange rates
- Decimal-aware price calculations
- Emergency fee withdrawal

**Key Functions:**
- `swap(tokenIn, tokenOut, amountIn, minAmountOut)` - Execute a swap
- `estimateAmountOut(tokenIn, tokenOut, amountIn)` - Get expected output
- `setRate(tokenIn, tokenOut, rate)` - Set exchange rate (owner)
- `setFeeBps(newFeeBps)` - Set fee percentage (owner)
- `setTokenConfig(token, decimals, enabled)` - Configure token (owner)

### LockVault.sol
Token locking and staking contract:
- Users lock ERC20 tokens for fixed durations
- Fixed reward percentage per lock duration
- Automatic reward calculation on deposit
- Withdrawal after lock expiration
- Owner manages supported tokens and reward rates

**Key Functions:**
- `lock(token, amount, lockDays)` - Lock tokens, returns position ID
- `withdraw(positionId)` - Withdraw after unlock (principal + reward)
- `setSupportedToken(token, supported)` - Configure token (owner)
- `setRewardRate(lockDays, rewardBps)` - Set reward rate (owner)
- `getPosition(positionId)` - View position details

## Setup & Deployment

### 1. Install Dependencies (when network is stable)

```bash
npm install --legacy-peer-deps
```

### 2. Compile Contracts

```bash
npm run compile
```

### 3. Set Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# KiiChain testnet RPC endpoint
KII_RPC_URL=https://testnet.orochain.rpc.example

# Deployer private key (without 0x prefix for best compatibility)
DEPLOYER_PRIVATE_KEY=your_private_key_here
```

### 4. Deploy to KiiChain Testnet

```bash
npm run deploy:kii
```

This will:
- Compile contracts
- Deploy SimpleSwap with 30 bps fee
- Deploy LockVault
- Write deployment metadata to `deployments/kiiChainTestnet.json`

### 5. Export ABIs

```bash
npm run export-abis
```

Generates ABI files in `abis/` directory for frontend use.

## Frontend Integration

### Using Contracts in React

```typescript
import { getSimpleSwapContract, getLockVaultContract } from "@/lib/contract-helpers";
import { getBrowserProvider } from "@/lib/chain-transactions";

// Get signer from wallet
const provider = getBrowserProvider();
const signer = provider.getSigner();

// SimpleSwap
const swapContract = getSimpleSwapContract(signer);
const amountOut = await swapContract.estimateAmountOut(
  tokenInAddress,
  tokenOutAddress,
  amountIn
);
const tx = await swapContract.swap(
  tokenInAddress,
  tokenOutAddress,
  amountIn,
  minAmountOut
);

// LockVault
const vaultContract = getLockVaultContract(signer);
const positionId = await vaultContract.lock(tokenAddress, amount, 30); // 30 days
const position = await vaultContract.getPosition(positionId);
const withdrawTx = await vaultContract.withdraw(positionId);
```

### Environment Variables for Frontend

Update your `.env.local` after deployment:

```bash
NEXT_PUBLIC_SIMPLE_SWAP_ADDRESS=0xDeployed SimpleSwap address
NEXT_PUBLIC_LOCK_VAULT_ADDRESS=0xDeployed LockVault address
```

## Contract Architecture

### SimpleSwap Features
- **Token Registry**: Admin-configured token list with decimals
- **Exchange Rates**: Configurable rates between token pairs
- **Fee Handling**: Basis-point fee extracted to contract owner
- **Decimal Normalization**: Automatic decimal adjustment for price calculation
- **Gas Efficient**: Minimal storage, view functions don't consume gas

### LockVault Features
- **Position NFT Pattern**: Each lock is a unique position ID
- **Time-Based Unlocks**: `block.timestamp` validation for unlock
- **Fixed Rewards**: Pre-calculated rewards at lock time
- **No Rebasing**: Rewards are separate from principal
- **Withdrawal Safety**: Prevents double-withdrawal with flag

## Testing

Run unit tests:

```bash
npm test
```

Example test coverage:
- Token configuration
- Rate setting and validation
- Swap execution with fee deduction
- Lock creation and reward calculation
- Withdrawal after unlock period
- Permission checks (onlyOwner)

## Deployment Checklist

- [ ] Private key configured in `.env`
- [ ] KiiChain testnet RPC URL confirmed
- [ ] Contracts compiled successfully
- [ ] Test deployment on local Hardhat network
- [ ] Deploy to KiiChain testnet
- [ ] Verify deployed addresses
- [ ] Export ABIs
- [ ] Update frontend `.env.local` with contract addresses
- [ ] Test swap and lock flows in frontend
- [ ] Monitor gas usage and fees

## Security Considerations

- Contracts use OpenZeppelin interfaces for ERC20 compatibility
- Owner is responsible for setting fair exchange rates
- Time locks prevent withdrawal before expiration
- Fee basis points capped at 1000 (10%) for SimpleSwap
- Reward basis points capped at 2000 (20%) for LockVault
- No flash loan vulnerabilities (no callbacks)

## Useful Commands

```bash
# Compile contracts
npm run compile

# Deploy to testnet
npm run deploy:kii

# Export ABIs for frontend
npm run export-abis

# Run tests (after npm install)
npm test

# Interact with Hardhat console
npx hardhat console --network kiiChainTestnet
```

## Troubleshooting

**Contract won't compile**: Ensure Solidity 0.8.19 is installed and source files are in `contracts/` directory.

**Deployment fails**: Check that `DEPLOYER_PRIVATE_KEY` and `KII_RPC_URL` are set in `.env` and the account has KII testnet funds.

**Rate calculation incorrect**: Rates are stored as 1e18 scaled values. Ensure token decimals are configured correctly.

**Withdrawal fails**: Verify the position exists, caller owns the position, and the lock period has expired.
