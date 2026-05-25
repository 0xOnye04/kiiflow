import { Contract, Signer, Provider } from "ethers";

export const SIMPLE_SWAP_ABI = [
  "function owner() view returns (address)",
  "function feeBps() view returns (uint256)",
  "function estimateAmountOut(address tokenIn,address tokenOut,uint256 amountIn) view returns (uint256)",
  "function swap(address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut) returns (uint256)",
  "function setRate(address tokenIn,address tokenOut,uint256 rate)",
  "function setFeeBps(uint256 newFeeBps)",
  "function setTokenConfig(address token,uint8 decimals,bool enabled)",
  "event SwapExecuted(address indexed sender,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 amountOut,uint256 feeAmount)"
];

export const LOCK_VAULT_ABI = [
  "function owner() view returns (address)",
  "function nextPositionId() view returns (uint256)",
  "function supportedTokens(address token) view returns (bool)",
  "function rewardBpsByDays(uint256 lockDays) view returns (uint256)",
  "function lock(address token,uint256 amount,uint256 lockDays) returns (uint256)",
  "function withdraw(uint256 positionId) returns (uint256)",
  "function setSupportedToken(address token,bool supported)",
  "function setRewardRate(uint256 lockDays,uint256 rewardBps)",
  "function getPosition(uint256 positionId) view returns (address owner,address token,uint256 amount,uint256 reward,uint256 unlockTimestamp,bool withdrawn)",
  "event TokenLocked(uint256 indexed positionId,address indexed account,address indexed token,uint256 amount,uint256 unlockTimestamp,uint256 reward)",
  "event TokenWithdrawn(uint256 indexed positionId,address indexed account,address indexed token,uint256 amount,uint256 reward)"
];

export const SIMPLE_SWAP_ADDRESS = process.env.NEXT_PUBLIC_SIMPLE_SWAP_ADDRESS || "";
export const LOCK_VAULT_ADDRESS = process.env.NEXT_PUBLIC_LOCK_VAULT_ADDRESS || "";

export function getSimpleSwapContract(signerOrProvider: Signer | Provider) {
  return new Contract(SIMPLE_SWAP_ADDRESS, SIMPLE_SWAP_ABI, signerOrProvider);
}

export function getLockVaultContract(signerOrProvider: Signer | Provider) {
  return new Contract(LOCK_VAULT_ADDRESS, LOCK_VAULT_ABI, signerOrProvider);
}
