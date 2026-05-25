// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@account-abstraction/contracts/core/BaseAccount.sol";
import "@account-abstraction/contracts/core/Helpers.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";

contract Simple4337Account is BaseAccount {
    IEntryPoint private immutable _entryPoint;
    address public owner;

    event OwnerChanged(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    constructor(address initialOwner, IEntryPoint initialEntryPoint) {
        require(initialOwner != address(0), "Simple4337Account: owner is zero");
        require(address(initialEntryPoint) != address(0), "Simple4337Account: EntryPoint is zero");
        owner = initialOwner;
        _entryPoint = initialEntryPoint;
    }

    receive() external payable {}

    function entryPoint() public view override returns (IEntryPoint) {
        return _entryPoint;
    }

    function nonce() external view returns (uint256) {
        return getNonce();
    }

    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Simple4337Account: owner is zero");
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    function _requireForExecute() internal view override {
        if (msg.sender != address(entryPoint()) && msg.sender != owner && msg.sender != address(this)) {
            revert("Simple4337Account: caller cannot execute");
        }
    }

    function _validateSignature(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) internal view override returns (uint256 validationData) {
        address recovered = ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(userOpHash), userOp.signature);
        return recovered == owner ? SIG_VALIDATION_SUCCESS : SIG_VALIDATION_FAILED;
    }

    function _onlyOwner() internal view {
        require(msg.sender == owner || msg.sender == address(this), "Simple4337Account: caller is not owner");
    }
}
