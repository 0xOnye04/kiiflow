// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ERC4337Types.sol";

contract MockEntryPoint is IEntryPoint {
    mapping(address => uint256) public deposits;

    event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, bool success, uint256 actualGasCost);

    function depositTo(address account) external payable override {
        require(account != address(0), "MockEntryPoint: account is zero");
        deposits[account] += msg.value;
    }

    function balanceOf(address account) external view override returns (uint256) {
        return deposits[account];
    }

    function handleOps(UserOperation[] calldata ops, address payable beneficiary) external {
        require(beneficiary != address(0), "MockEntryPoint: beneficiary is zero");

        for (uint256 i = 0; i < ops.length; i++) {
            _handleOp(ops[i], beneficiary);
        }
    }

    function getUserOpHash(UserOperation calldata userOp) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                address(this),
                block.chainid,
                userOp.sender,
                userOp.nonce,
                keccak256(userOp.initCode),
                keccak256(userOp.callData),
                userOp.callGasLimit,
                userOp.verificationGasLimit,
                userOp.preVerificationGas,
                userOp.maxFeePerGas,
                userOp.maxPriorityFeePerGas,
                keccak256(userOp.paymasterAndData)
            )
        );
    }

    function _handleOp(UserOperation calldata userOp, address payable beneficiary) internal {
        bytes32 userOpHash = getUserOpHash(userOp);
        uint256 maxCost = _maxCost(userOp);
        address paymaster = _getPaymaster(userOp.paymasterAndData);

        require(deposits[paymaster] >= maxCost, "MockEntryPoint: insufficient paymaster deposit");

        IAccount(userOp.sender).validateUserOp(userOp, userOpHash, 0);
        (bytes memory context,) = IPaymaster(paymaster).validatePaymasterUserOp(userOp, userOpHash, maxCost);

        bool success = true;
        (bool callSuccess,) = userOp.sender.call{gas: userOp.callGasLimit}(userOp.callData);
        if (!callSuccess) {
            success = false;
        }

        uint256 actualGasCost = maxCost;
        deposits[paymaster] -= actualGasCost;
        beneficiary.transfer(actualGasCost);
        IPaymaster(paymaster).postOp(success ? PostOpMode.opSucceeded : PostOpMode.opReverted, context, actualGasCost);

        emit UserOperationEvent(userOpHash, userOp.sender, paymaster, success, actualGasCost);
    }

    function _maxCost(UserOperation calldata userOp) internal pure returns (uint256) {
        return (
            userOp.callGasLimit + userOp.verificationGasLimit + userOp.preVerificationGas
        ) * userOp.maxFeePerGas;
    }

    function _getPaymaster(bytes calldata paymasterAndData) internal pure returns (address paymaster) {
        require(paymasterAndData.length >= 20, "MockEntryPoint: missing paymaster");
        assembly {
            paymaster := shr(96, calldataload(paymasterAndData.offset))
        }
    }
}
