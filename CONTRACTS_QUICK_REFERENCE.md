# KiiFlow Smart Contracts - Quick Reference

## 📦 Installation & Setup

```bash
# Install all dependencies (may need retries due to network)
npm install --legacy-peer-deps

# Compile Solidity contracts
npm run compile

# Run local tests
npm test
```

## 🚀 Deployment to KiiChain Testnet

```bash
# 1. Set environment variables in .env
# Copy .env.example to .env and fill in:
#   KII_RPC_URL=https://testnet-rpc.orochain.com
#   DEPLOYER_PRIVATE_KEY=your_key_here

# 2. Deploy contracts
npm run deploy:kii

# 3. Export ABIs for frontend
npm run export-abis

# 4. Verify deployment
npx ts-node scripts/verify.ts
```

## 📄 File Locations

| Purpose | Path |
|---------|------|
| Solidity Contracts | `contracts/*.sol` |
| Deployment Script | `scripts/deploy.ts` |
| ABI Export Script | `scripts/export-abis.ts` |
| Verification Script | `scripts/verify.ts` |
| Test Suite | `test/contracts.test.ts` |
| Generated ABIs | `abis/*.json` |
| Deployment Data | `deployments/kiiChainTestnet.json` |
| Hardhat Config | `hardhat.config.ts` |
| Frontend Helpers | `lib/contract-helpers.ts` |

## 🔑 Environment Variables

```bash
# .env file
KII_RPC_URL=https://testnet-rpc.orochain.com
DEPLOYER_PRIVATE_KEY=your_private_key_without_0x_prefix

# .env.local (after deployment)
NEXT_PUBLIC_SIMPLE_SWAP_ADDRESS=0x...
NEXT_PUBLIC_LOCK_VAULT_ADDRESS=0x...
```

## 💻 Hardhat Console Commands

```bash
# Start interactive console
npx hardhat console --network kiiChainTestnet

# In console:
const swap = await ethers.getContractAt('SimpleSwap', '0x...');
const vault = await ethers.getContractAt('LockVault', '0x...');

// Check SimpleSwap config
await swap.feeBps();

// Set token rates
await swap.setTokenConfig(USDC_ADDRESS, 6, true);
await swap.setRate(USDC_ADDRESS, KII_ADDRESS, ethers.parseUnits('1.8', 18));

// Set lock vault rates
await vault.setSupportedToken(KII_ADDRESS, true);
await vault.setRewardRate(30, 1000); // 10% for 30 days
```

## 🧪 Contract Functions

### SimpleSwap.sol

```solidity
// Execute swap
function swap(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minAmountOut
) returns (uint256)

// Get swap quote
function estimateAmountOut(
    address tokenIn,
    address tokenOut,
    uint256 amountIn
) view returns (uint256)

// Owner: configure token
function setTokenConfig(
    address token,
    uint8 decimals,
    bool enabled
)

// Owner: set exchange rate
function setRate(
    address tokenIn,
    address tokenOut,
    uint256 rate
)

// Owner: set fee
function setFeeBps(uint256 newFeeBps)
```

### LockVault.sol

```solidity
// Lock tokens for rewards
function lock(
    address token,
    uint256 amount,
    uint256 lockDays
) returns (uint256 positionId)

// Claim tokens after unlock
function withdraw(uint256 positionId) returns (uint256 totalAmount)

// Owner: enable token
function setSupportedToken(address token, bool supported)

// Owner: set reward percentage
function setRewardRate(uint256 lockDays, uint256 rewardBps)

// View position details
function getPosition(uint256 positionId)
    view returns (Position memory)
```

## 🔄 Frontend Integration

```typescript
import { getSimpleSwapContract, getLockVaultContract } from "@/lib/contract-helpers";

// Get contract with signer
const signer = provider.getSigner();
const swapContract = getSimpleSwapContract(signer);
const vaultContract = getLockVaultContract(signer);

// All ethers.js methods available
const tx = await swapContract.swap(...);
const receipt = await tx.wait();
```

## ⚡ Gas Estimates (KiiChain)

| Operation | Gas | Cost (@ 1 Gwei) |
|-----------|-----|-----------------|
| Swap | ~120,000 | ~0.00012 KII |
| Lock | ~150,000 | ~0.00015 KII |
| Unlock | ~80,000 | ~0.00008 KII |

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| `ECONNRESET` on npm install | Retry with `npm install --legacy-peer-deps` |
| Compilation fails | Ensure Solidity 0.8.19 is specified |
| Deployment fails | Check .env vars and account has funds |
| Tests fail | Run `npm test` to identify issues |
| ABI not found | Run `npm run export-abis` |
| Contract unresponsive | Verify RPC URL is correct |

## 📊 Contract Events

### SimpleSwap Events
```solidity
event SwapExecuted(
    address indexed sender,
    address indexed tokenIn,
    address indexed tokenOut,
    uint256 amountIn,
    uint256 amountOut,
    uint256 feeAmount
)
```

### LockVault Events
```solidity
event TokenLocked(
    uint256 indexed positionId,
    address indexed account,
    address indexed token,
    uint256 amount,
    uint256 unlockTimestamp,
    uint256 reward
)

event TokenWithdrawn(
    uint256 indexed positionId,
    address indexed account,
    address indexed token,
    uint256 amount,
    uint256 reward
)
```

## 📋 Post-Deployment Checklist

- [ ] Contracts deployed to KiiChain testnet
- [ ] Deployment addresses saved in `deployments/kiiChainTestnet.json`
- [ ] ABIs exported to `abis/` directory
- [ ] Frontend env vars updated with addresses
- [ ] SimpleSwap token pairs configured
- [ ] LockVault reward rates set
- [ ] Frontend swap functionality tested
- [ ] Frontend lock functionality tested
- [ ] Monitor gas usage and fees

## 🔗 Useful Links

- KiiChain Testnet: https://testnet-explorer.orochain.com
- Hardhat Docs: https://hardhat.org/docs
- Ethers.js Docs: https://docs.ethers.org
- Solidity Docs: https://docs.soliditylang.org

---

For detailed documentation, see:
- `SMART_CONTRACTS.md` - Complete contract guide
- `CONTRACTS_INTEGRATION.md` - Integration details
