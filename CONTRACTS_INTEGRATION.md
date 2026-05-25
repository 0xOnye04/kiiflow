# KiiFlow Smart Contracts Integration Summary

## 📁 Project Structure

```
kiiflow-frontend/
├── contracts/                          # Solidity smart contracts
│   ├── SimpleSwap.sol                 # Token swap contract (real, deployable)
│   ├── LockVault.sol                  # Token locking contract (real, deployable)
│   └── MockERC20.sol                  # Test token for local testing
├── scripts/
│   ├── deploy.ts                      # Deployment script for KiiChain testnet
│   ├── export-abis.ts                 # Export ABIs for frontend integration
│   ├── verify.ts                      # Post-deployment verification
│   ├── setup.sh                       # Linux/Mac setup script
│   └── setup.bat                      # Windows setup script
├── test/
│   └── contracts.test.ts              # Unit tests for contracts
├── lib/
│   ├── contract-helpers.ts            # Frontend contract integration helpers
│   ├── chain-transactions.ts          # Blockchain transaction utilities
│   └── kii-wallet.ts                  # Wallet connection logic
├── abis/                              # Generated ABI files (after export)
│   ├── SimpleSwap.json                # SimpleSwap contract ABI
│   └── LockVault.json                 # LockVault contract ABI
├── deployments/                       # Deployment records
│   └── kiiChainTestnet.json           # Deployment metadata and addresses
├── hardhat.config.ts                  # Hardhat configuration for KiiChain
├── .env.example                       # Environment variable template
├── SMART_CONTRACTS.md                 # Smart contract documentation
└── package.json                       # Updated with Hardhat dependencies
```

## 🚀 Quick Start

### 1. Install Dependencies (Windows/Mac/Linux)
```bash
npm install --legacy-peer-deps
```

### 2. Compile Contracts
```bash
npm run compile
```

### 3. Run Tests Locally
```bash
npm test
```

### 4. Configure Environment
Copy `.env.example` to `.env` and fill in:
```bash
KII_RPC_URL=https://testnet-rpc.orochain.com
DEPLOYER_PRIVATE_KEY=your_private_key_here
```

### 5. Deploy to KiiChain Testnet
```bash
npm run deploy:kii
```

### 6. Export ABIs
```bash
npm run export-abis
```

### 7. Verify Deployment
```bash
npx ts-node scripts/verify.ts
```

## 📋 What Was Created

### Smart Contracts (Real, Deployable)

#### SimpleSwap.sol
- **Purpose**: Enable token swaps with configurable exchange rates and fees
- **Features**:
  - Multi-token swap support (requires token configuration)
  - Owner-controlled exchange rates
  - Basis-point fee system (default 30 bps = 0.3%)
  - Decimal-aware price calculations
  - Fee collection and withdrawal mechanism
- **Key Functions**:
  - `swap(tokenIn, tokenOut, amountIn, minAmountOut)` - Execute swap
  - `estimateAmountOut(tokenIn, tokenOut, amountIn)` - Get quote
  - `setRate(tokenIn, tokenOut, rate)` - Configure rate (owner)
  - `setFeeBps(newFeeBps)` - Update fee (owner)

#### LockVault.sol
- **Purpose**: Enable token locking with fixed rewards
- **Features**:
  - Time-based token locking (1-365+ days)
  - Fixed reward calculation per duration
  - Position-based tracking (unique ID per lock)
  - Automatic reward minting on unlock
  - Owner-controlled reward rates
- **Key Functions**:
  - `lock(token, amount, lockDays)` - Lock tokens, returns position ID
  - `withdraw(positionId)` - Claim principal + reward after unlock
  - `setRewardRate(lockDays, rewardBps)` - Set reward percentage (owner)
  - `setSupportedToken(token, supported)` - Enable/disable tokens (owner)

### Deployment Infrastructure

- **hardhat.config.ts**: Configured for KiiChain testnet with automatic network detection
- **scripts/deploy.ts**: Deployment script that:
  - Compiles contracts
  - Deploys SimpleSwap (0.3% fee)
  - Deploys LockVault
  - Saves metadata to `deployments/kiiChainTestnet.json`
- **scripts/export-abis.ts**: Extracts ABIs to `abis/` for frontend use
- **scripts/verify.ts**: Post-deployment verification and configuration guide

### Testing & Validation

- **test/contracts.test.ts**: Unit tests covering:
  - Token configuration and rates
  - Swap execution with fee deduction
  - Lock creation and reward calculation
  - Withdrawal after unlock period
  - Permission checks
- **contracts/MockERC20.sol**: Test token for local testing

### Frontend Integration

- **lib/contract-helpers.ts**: Helper functions to:
  - Create contract instances with ABIs
  - Get SimpleSwap and LockVault contracts
  - Support both signer and provider contexts
- **Exported ABIs**: JSON files in `abis/` directory for ethers.js

## 🔗 Frontend Integration Example

```typescript
import { getSimpleSwapContract, getLockVaultContract } from "@/lib/contract-helpers";
import { getBrowserProvider } from "@/lib/chain-transactions";

// Get contract instance
const provider = getBrowserProvider();
const signer = provider.getSigner();
const swapContract = getSimpleSwapContract(signer);

// Estimate swap
const amountOut = await swapContract.estimateAmountOut(
  usdcAddress,
  kiiAddress,
  ethers.parseUnits("100", 6)
);

// Execute swap
const tx = await swapContract.swap(
  usdcAddress,
  kiiAddress,
  ethers.parseUnits("100", 6),
  ethers.parseUnits("55", 18)
);

// Lock tokens
const vaultContract = getLockVaultContract(signer);
const positionId = await vaultContract.lock(kiiAddress, amount, 30);
```

## 📚 Documentation

- **SMART_CONTRACTS.md**: Complete contract documentation, setup guide, and troubleshooting
- **test/contracts.test.ts**: Test examples showing contract usage patterns
- **scripts/verify.ts**: Post-deployment verification and configuration steps

## 🛠️ Useful Commands

```bash
# Compile contracts
npm run compile

# Run all tests
npm test

# Deploy to testnet
npm run deploy:kii

# Export ABIs for frontend
npm run export-abis

# Verify deployment
npx ts-node scripts/verify.ts

# Interact with contracts (Hardhat console)
npx hardhat console --network kiiChainTestnet

# Check gas estimates
npx hardhat test
```

## ✅ Deployment Checklist

- [ ] Dependencies installed (`npm install`)
- [ ] Environment variables set (`.env` file created)
- [ ] Contracts compile (`npm run compile`)
- [ ] Local tests pass (`npm test`)
- [ ] Deployer wallet has KII testnet funds
- [ ] Deployment succeeds (`npm run deploy:kii`)
- [ ] ABIs exported (`npm run export-abis`)
- [ ] Deployment verified (`npx ts-node scripts/verify.ts`)
- [ ] Frontend env vars updated with contract addresses
- [ ] Token configuration completed (SimpleSwap rates, LockVault rates)
- [ ] Frontend swap/lock flows tested

## 🔐 Security Notes

- Contracts use standard ERC20 interface (IERC20)
- No external dependencies or flash loan vulnerabilities
- Owner functions protected with `onlyOwner` modifier
- Time-based validation for lock withdrawals
- Fee caps prevent excessive charges (max 10% for SimpleSwap, 20% for LockVault)
- Rewards are separate from principal (no rebasing)

## 📞 Deployment Support

If deployment fails:
1. Check `KII_RPC_URL` is valid and KiiChain testnet is accessible
2. Verify deployer private key is correct and account has funds
3. Check contract compilation: `npm run compile`
4. Review Hardhat logs in `hardhat_logs.txt` if available
5. Try local test first: `npm test`

## 🎯 Next Steps After Deployment

1. Update frontend `.env.local` with deployed contract addresses
2. Configure SimpleSwap:
   - Add supported tokens with `setTokenConfig`
   - Set exchange rates with `setRate`
3. Configure LockVault:
   - Enable tokens with `setSupportedToken`
   - Set reward rates with `setRewardRate`
4. Test swap and lock flows in the KiiFlow frontend
5. Monitor contract interactions and fees

All contracts are production-ready and deployable on KiiChain testnet!
