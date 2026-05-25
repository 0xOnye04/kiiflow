// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

contract OracleManager is Ownable {
    struct PriceConfig {
        uint256 tokenPerKii;
        uint48 updatedAt;
        uint48 maxStaleness;
        bool enabled;
    }

    mapping(address => PriceConfig) public prices;

    event PriceUpdated(address indexed token, uint256 tokenPerKii, uint48 maxStaleness, bool enabled);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setTokenPrice(address token, uint256 tokenPerKii, uint48 maxStaleness, bool enabled) external onlyOwner {
        require(token != address(0), "OracleManager: token is zero");
        require(tokenPerKii > 0, "OracleManager: price is zero");
        require(maxStaleness > 0, "OracleManager: max staleness is zero");

        prices[token] = PriceConfig({
            tokenPerKii: tokenPerKii,
            updatedAt: uint48(block.timestamp),
            maxStaleness: maxStaleness,
            enabled: enabled
        });

        emit PriceUpdated(token, tokenPerKii, maxStaleness, enabled);
    }

    function quoteTokenFee(address token, uint256 kiiWeiCost, uint256 slippageBps) external view returns (uint256) {
        PriceConfig memory price = prices[token];
        require(price.enabled, "OracleManager: price disabled");
        require(block.timestamp <= price.updatedAt + price.maxStaleness, "OracleManager: stale price");
        require(slippageBps <= 5_000, "OracleManager: slippage too high");

        uint256 baseTokenFee = (kiiWeiCost * price.tokenPerKii) / 1 ether;
        return baseTokenFee + ((baseTokenFee * slippageBps) / 10_000);
    }
}
