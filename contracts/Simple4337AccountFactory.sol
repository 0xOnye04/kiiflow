// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "./Simple4337Account.sol";

contract Simple4337AccountFactory {
    IEntryPoint public immutable entryPoint;

    event AccountCreated(address indexed account, address indexed owner, bytes32 indexed salt);

    constructor(IEntryPoint initialEntryPoint) {
        require(address(initialEntryPoint) != address(0), "Simple4337AccountFactory: EntryPoint is zero");
        entryPoint = initialEntryPoint;
    }

    function createAccount(address owner, bytes32 salt) external returns (Simple4337Account account) {
        address predicted = getAddress(owner, salt);
        if (predicted.code.length > 0) {
            return Simple4337Account(payable(predicted));
        }

        account = new Simple4337Account{salt: salt}(owner, entryPoint);
        emit AccountCreated(address(account), owner, salt);
    }

    function getAddress(address owner, bytes32 salt) public view returns (address) {
        bytes32 bytecodeHash = keccak256(
            abi.encodePacked(type(Simple4337Account).creationCode, abi.encode(owner, entryPoint))
        );

        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, bytecodeHash)))));
    }
}
