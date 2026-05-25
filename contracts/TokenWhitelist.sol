// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenWhitelist is Ownable {
    struct TokenConfig {
        bool enabled;
        uint8 decimals;
        uint256 maxFeePerOp;
        uint256 maxSlippageBps;
    }

    mapping(address => TokenConfig) public tokenConfigs;

    event TokenConfigured(address indexed token, uint8 decimals, uint256 maxFeePerOp, uint256 maxSlippageBps, bool enabled);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setToken(
        address token,
        uint8 decimals,
        uint256 maxFeePerOp,
        uint256 maxSlippageBps,
        bool enabled
    ) external onlyOwner {
        require(token != address(0), "TokenWhitelist: token is zero");
        require(decimals <= 18, "TokenWhitelist: decimals too high");
        require(maxFeePerOp > 0, "TokenWhitelist: max fee is zero");
        require(maxSlippageBps <= 5_000, "TokenWhitelist: slippage too high");

        tokenConfigs[token] = TokenConfig({
            enabled: enabled,
            decimals: decimals,
            maxFeePerOp: maxFeePerOp,
            maxSlippageBps: maxSlippageBps
        });

        emit TokenConfigured(token, decimals, maxFeePerOp, maxSlippageBps, enabled);
    }

    function isEnabled(address token) external view returns (bool) {
        return tokenConfigs[token].enabled;
    }

    function requireEnabled(address token) external view returns (TokenConfig memory config) {
        config = tokenConfigs[token];
        require(config.enabled, "TokenWhitelist: token disabled");
    }
}
