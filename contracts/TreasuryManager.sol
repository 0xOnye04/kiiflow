// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

interface ITreasurySettlementRouter {
    function swapToKii(address token, uint256 amountIn, uint256 minKiiOut, address recipient) external returns (uint256 kiiOut);
}

contract TreasuryManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IEntryPoint public immutable entryPoint;
    address public paymaster;
    address public operator;

    event PaymasterChanged(address indexed previousPaymaster, address indexed newPaymaster);
    event OperatorChanged(address indexed previousOperator, address indexed newOperator);
    event StablecoinFeeCollected(address indexed account, address indexed token, uint256 amount);
    event StablecoinConvertedAndRefilled(address indexed token, address indexed router, uint256 amountIn, uint256 kiiOut);

    modifier onlyPaymaster() {
        require(msg.sender == paymaster, "TreasuryManager: caller is not paymaster");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operator || msg.sender == owner(), "TreasuryManager: caller is not operator");
        _;
    }

    constructor(IEntryPoint initialEntryPoint, address initialOwner, address initialOperator) Ownable(initialOwner) {
        require(address(initialEntryPoint) != address(0), "TreasuryManager: EntryPoint is zero");
        require(initialOperator != address(0), "TreasuryManager: operator is zero");
        entryPoint = initialEntryPoint;
        operator = initialOperator;
    }

    receive() external payable {}

    function setPaymaster(address newPaymaster) external onlyOwner {
        require(newPaymaster != address(0), "TreasuryManager: paymaster is zero");
        emit PaymasterChanged(paymaster, newPaymaster);
        paymaster = newPaymaster;
    }

    function setOperator(address newOperator) external onlyOwner {
        require(newOperator != address(0), "TreasuryManager: operator is zero");
        emit OperatorChanged(operator, newOperator);
        operator = newOperator;
    }

    function tokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function collectFee(address account, address token, uint256 amount) external onlyPaymaster nonReentrant {
        IERC20(token).safeTransferFrom(account, address(this), amount);
        emit StablecoinFeeCollected(account, token, amount);
    }

    function convertAndRefill(address router, address token, uint256 amountIn, uint256 minKiiOut) external onlyOperator nonReentrant returns (uint256 kiiOut) {
        require(router != address(0), "TreasuryManager: router is zero");
        require(amountIn > 0, "TreasuryManager: amount is zero");
        uint256 balanceBefore = address(this).balance;

        IERC20(token).forceApprove(router, amountIn);
        kiiOut = ITreasurySettlementRouter(router).swapToKii(token, amountIn, minKiiOut, address(this));

        uint256 received = address(this).balance - balanceBefore;
        require(received >= minKiiOut, "TreasuryManager: insufficient KII");
        require(received == kiiOut, "TreasuryManager: router mismatch");

        entryPoint.depositTo{value: received}(paymaster);
        emit StablecoinConvertedAndRefilled(token, router, amountIn, received);
    }
}
