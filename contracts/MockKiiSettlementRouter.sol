// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IRouterERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

contract MockKiiSettlementRouter {
    address public treasury;
    mapping(address => uint256) public kiiOutPerTokenUnit;

    event RateSet(address indexed token, uint256 kiiOutPerTokenUnit);
    event StablecoinSwapped(address indexed token, address indexed payer, uint256 tokenIn, uint256 kiiOut);

    constructor(address initialTreasury) {
        require(initialTreasury != address(0), "MockKiiSettlementRouter: treasury is zero");
        treasury = initialTreasury;
    }

    receive() external payable {}

    function setRate(address token, uint256 newKiiOutPerTokenUnit) external {
        require(token != address(0), "MockKiiSettlementRouter: token is zero");
        require(newKiiOutPerTokenUnit > 0, "MockKiiSettlementRouter: rate is zero");
        kiiOutPerTokenUnit[token] = newKiiOutPerTokenUnit;
        emit RateSet(token, newKiiOutPerTokenUnit);
    }

    function swapToKii(address token, uint256 amountIn, uint256 minKiiOut, address recipient) external returns (uint256 kiiOut) {
        require(token != address(0), "MockKiiSettlementRouter: token is zero");
        require(recipient != address(0), "MockKiiSettlementRouter: recipient is zero");
        uint256 rate = kiiOutPerTokenUnit[token];
        require(rate > 0, "MockKiiSettlementRouter: route unavailable");

        kiiOut = amountIn * rate;
        require(kiiOut >= minKiiOut, "MockKiiSettlementRouter: insufficient output");
        require(address(this).balance >= kiiOut, "MockKiiSettlementRouter: insufficient KII liquidity");
        require(IRouterERC20(token).transferFrom(msg.sender, treasury, amountIn), "MockKiiSettlementRouter: token transfer failed");

        (bool success,) = recipient.call{value: kiiOut}("");
        require(success, "MockKiiSettlementRouter: KII transfer failed");

        emit StablecoinSwapped(token, msg.sender, amountIn, kiiOut);
    }
}
