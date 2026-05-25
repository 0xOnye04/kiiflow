// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface ISettlementEntryPoint {
    function depositTo(address account) external payable;
}

interface ISettlementERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IKiiSettlementRouter {
    function swapToKii(address token, uint256 amountIn, uint256 minKiiOut, address recipient) external returns (uint256 kiiOut);
}

contract StablecoinSettlementVault {
    address public owner;
    address public operator;
    address public immutable entryPoint;
    address public immutable paymaster;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OperatorChanged(address indexed previousOperator, address indexed newOperator);
    event StablecoinSwept(address indexed token, address indexed recipient, uint256 amount);
    event PaymasterRefilled(uint256 amount);
    event StablecoinConvertedAndRefilled(address indexed token, address indexed router, uint256 tokenIn, uint256 kiiOut);

    modifier onlyOwner() {
        require(msg.sender == owner, "StablecoinSettlementVault: caller is not owner");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operator || msg.sender == owner, "StablecoinSettlementVault: caller is not operator");
        _;
    }

    constructor(address initialEntryPoint, address initialPaymaster, address initialOperator) {
        require(initialEntryPoint != address(0), "StablecoinSettlementVault: EntryPoint is zero");
        require(initialPaymaster != address(0), "StablecoinSettlementVault: paymaster is zero");
        require(initialOperator != address(0), "StablecoinSettlementVault: operator is zero");
        owner = msg.sender;
        entryPoint = initialEntryPoint;
        paymaster = initialPaymaster;
        operator = initialOperator;
    }

    receive() external payable {}

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "StablecoinSettlementVault: owner is zero");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setOperator(address newOperator) external onlyOwner {
        require(newOperator != address(0), "StablecoinSettlementVault: operator is zero");
        emit OperatorChanged(operator, newOperator);
        operator = newOperator;
    }

    function tokenBalance(address token) external view returns (uint256) {
        return ISettlementERC20(token).balanceOf(address(this));
    }

    function sweepStablecoin(address token, address recipient, uint256 amount) external onlyOperator {
        require(token != address(0), "StablecoinSettlementVault: token is zero");
        require(recipient != address(0), "StablecoinSettlementVault: recipient is zero");
        require(amount > 0, "StablecoinSettlementVault: amount is zero");
        require(ISettlementERC20(token).transfer(recipient, amount), "StablecoinSettlementVault: transfer failed");
        emit StablecoinSwept(token, recipient, amount);
    }

    function refillPaymaster() external payable onlyOperator {
        require(msg.value > 0, "StablecoinSettlementVault: value is zero");
        ISettlementEntryPoint(entryPoint).depositTo{value: msg.value}(paymaster);
        emit PaymasterRefilled(msg.value);
    }

    function convertAndRefill(address router, address token, uint256 amountIn, uint256 minKiiOut) external onlyOperator returns (uint256 kiiOut) {
        require(router != address(0), "StablecoinSettlementVault: router is zero");
        require(token != address(0), "StablecoinSettlementVault: token is zero");
        require(amountIn > 0, "StablecoinSettlementVault: amount is zero");

        uint256 balanceBefore = address(this).balance;
        require(ISettlementERC20(token).approve(router, amountIn), "StablecoinSettlementVault: approve failed");
        kiiOut = IKiiSettlementRouter(router).swapToKii(token, amountIn, minKiiOut, address(this));
        uint256 received = address(this).balance - balanceBefore;
        require(received >= minKiiOut, "StablecoinSettlementVault: insufficient KII received");
        require(received == kiiOut, "StablecoinSettlementVault: router output mismatch");

        ISettlementEntryPoint(entryPoint).depositTo{value: received}(paymaster);
        emit StablecoinConvertedAndRefilled(token, router, amountIn, received);
    }
}
