// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract SimpleSwap {
    address public owner;
    uint256 public feeBps;

    struct TokenConfig {
        bool enabled;
        uint8 decimals;
    }

    mapping(address => TokenConfig) public tokenConfigs;
    mapping(address => mapping(address => uint256)) public rates;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TokenConfigured(address indexed token, uint8 decimals, bool enabled);
    event RateUpdated(address indexed tokenIn, address indexed tokenOut, uint256 rate);
    event FeeUpdated(uint256 feeBps);
    event SwapExecuted(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 feeAmount);
    event FeesWithdrawn(address indexed token, address indexed recipient, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "SimpleSwap: caller is not the owner");
        _;
    }

    constructor(uint256 initialFeeBps) {
        owner = msg.sender;
        feeBps = initialFeeBps;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "SimpleSwap: new owner is the zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setTokenConfig(address token, uint8 decimals, bool enabled) external onlyOwner {
        require(token != address(0), "SimpleSwap: token is the zero address");
        tokenConfigs[token] = TokenConfig({enabled: enabled, decimals: decimals});
        emit TokenConfigured(token, decimals, enabled);
    }

    function setRate(address tokenIn, address tokenOut, uint256 rate) external onlyOwner {
        require(tokenIn != address(0) && tokenOut != address(0), "SimpleSwap: invalid token addresses");
        require(tokenIn != tokenOut, "SimpleSwap: tokens must differ");
        require(rate > 0, "SimpleSwap: rate must be positive");
        require(tokenConfigs[tokenIn].enabled && tokenConfigs[tokenOut].enabled, "SimpleSwap: token not configured");
        rates[tokenIn][tokenOut] = rate;
        emit RateUpdated(tokenIn, tokenOut, rate);
    }

    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "SimpleSwap: fee too high");
        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    function withdrawFees(address token, address recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "SimpleSwap: recipient is the zero address");
        require(amount > 0, "SimpleSwap: amount must be greater than zero");
        require(tokenConfigs[token].enabled, "SimpleSwap: token not configured");

        IERC20(token).transfer(recipient, amount);
        emit FeesWithdrawn(token, recipient, amount);
    }

    function estimateAmountOut(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256) {
        require(amountIn > 0, "SimpleSwap: amountIn must be greater than zero");
        require(tokenConfigs[tokenIn].enabled && tokenConfigs[tokenOut].enabled, "SimpleSwap: token not configured");
        uint256 rawOut = _getAmountOut(tokenIn, tokenOut, amountIn);
        uint256 fee = (rawOut * feeBps) / 10000;
        return rawOut - fee;
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut) external returns (uint256) {
        require(amountIn > 0, "SimpleSwap: amountIn must be greater than zero");
        require(tokenIn != tokenOut, "SimpleSwap: tokens must differ");
        require(tokenConfigs[tokenIn].enabled && tokenConfigs[tokenOut].enabled, "SimpleSwap: token not configured");

        uint256 rawOut = _getAmountOut(tokenIn, tokenOut, amountIn);
        uint256 fee = (rawOut * feeBps) / 10000;
        uint256 amountOut = rawOut - fee;
        require(amountOut >= minAmountOut, "SimpleSwap: insufficient output amount");

        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).transfer(msg.sender, amountOut);

        emit SwapExecuted(msg.sender, tokenIn, tokenOut, amountIn, amountOut, fee);
        return amountOut;
    }

    function _getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) internal view returns (uint256) {
        uint256 rate = rates[tokenIn][tokenOut];
        require(rate > 0, "SimpleSwap: rate not set");

        uint8 decimalsIn = tokenConfigs[tokenIn].decimals;
        uint8 decimalsOut = tokenConfigs[tokenOut].decimals;

        uint256 amountOut = (amountIn * rate) / 1e18;
        if (decimalsOut > decimalsIn) {
            amountOut *= 10 ** (decimalsOut - decimalsIn);
        } else if (decimalsIn > decimalsOut) {
            amountOut /= 10 ** (decimalsIn - decimalsOut);
        }

        return amountOut;
    }
}
