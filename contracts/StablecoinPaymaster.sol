// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@account-abstraction/contracts/core/Helpers.sol";
import "@account-abstraction/contracts/core/UserOperationLib.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "./OracleManager.sol";
import "./TokenWhitelist.sol";
import "./TreasuryManager.sol";

contract StablecoinPaymaster is BasePaymaster {
    using UserOperationLib for PackedUserOperation;

    enum FeeMode {
        Sponsor,
        TokenPay
    }

    struct PaymasterConfig {
        address token;
        uint256 maxTokenFee;
        uint48 validUntil;
        uint48 validAfter;
        FeeMode mode;
    }

    TokenWhitelist public tokenWhitelist;
    OracleManager public oracleManager;
    TreasuryManager public treasuryManager;

    event ManagersUpdated(address indexed tokenWhitelist, address indexed oracleManager, address indexed treasuryManager);
    event UserOperationPriced(
        bytes32 indexed userOpHash,
        address indexed account,
        address indexed token,
        FeeMode mode,
        uint256 maxCost,
        uint256 tokenPrefund
    );
    event StablecoinFeeSettled(
        bytes32 indexed userOpHash,
        address indexed account,
        address indexed token,
        uint256 actualGasCost,
        uint256 tokenCharge,
        FeeMode mode
    );

    constructor(
        IEntryPoint initialEntryPoint,
        TokenWhitelist initialTokenWhitelist,
        OracleManager initialOracleManager,
        TreasuryManager initialTreasuryManager
    ) BasePaymaster(initialEntryPoint) {
        _setManagers(initialTokenWhitelist, initialOracleManager, initialTreasuryManager);
    }

    function setManagers(
        TokenWhitelist newTokenWhitelist,
        OracleManager newOracleManager,
        TreasuryManager newTreasuryManager
    ) external onlyOwner {
        _setManagers(newTokenWhitelist, newOracleManager, newTreasuryManager);
    }

    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) internal override returns (bytes memory context, uint256 validationData) {
        PaymasterConfig memory config = parsePaymasterAndData(userOp.paymasterAndData);
        require(block.timestamp >= config.validAfter, "StablecoinPaymaster: not active");
        require(config.validUntil == 0 || block.timestamp <= config.validUntil, "StablecoinPaymaster: expired");

        uint256 tokenPrefund = 0;

        if (config.mode == FeeMode.TokenPay) {
            TokenWhitelist.TokenConfig memory tokenConfig = tokenWhitelist.requireEnabled(config.token);
            tokenPrefund = oracleManager.quoteTokenFee(config.token, maxCost, tokenConfig.maxSlippageBps);
            require(tokenPrefund <= config.maxTokenFee, "StablecoinPaymaster: fee exceeds cap");
            require(tokenPrefund <= tokenConfig.maxFeePerOp, "StablecoinPaymaster: token fee too high");
            require(IERC20(config.token).balanceOf(userOp.sender) >= tokenPrefund, "StablecoinPaymaster: insufficient balance");
            require(IERC20(config.token).allowance(userOp.sender, address(treasuryManager)) >= tokenPrefund, "StablecoinPaymaster: insufficient allowance");
        }

        context = abi.encode(userOpHash, userOp.sender, config.token, config.maxTokenFee, config.mode);
        validationData = _packValidationData(false, config.validUntil, config.validAfter);

        emit UserOperationPriced(userOpHash, userOp.sender, config.token, config.mode, maxCost, tokenPrefund);
    }

    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 actualUserOpFeePerGas
    ) internal override {
        (bytes32 userOpHash, address account, address token, uint256 maxTokenFee, FeeMode feeMode) =
            abi.decode(context, (bytes32, address, address, uint256, FeeMode));

        uint256 tokenCharge = 0;

        if (feeMode == FeeMode.TokenPay) {
            TokenWhitelist.TokenConfig memory tokenConfig = tokenWhitelist.requireEnabled(token);
            tokenCharge = oracleManager.quoteTokenFee(token, actualGasCost, tokenConfig.maxSlippageBps);
            require(tokenCharge <= maxTokenFee, "StablecoinPaymaster: postOp fee exceeds cap");
            treasuryManager.collectFee(account, token, tokenCharge);
        }

        emit StablecoinFeeSettled(userOpHash, account, token, actualGasCost, tokenCharge, feeMode);
        mode;
        actualUserOpFeePerGas;
    }

    function parsePaymasterAndData(bytes calldata paymasterAndData) public pure returns (PaymasterConfig memory config) {
        require(paymasterAndData.length >= PAYMASTER_DATA_OFFSET, "StablecoinPaymaster: paymasterAndData too short");
        bytes calldata encodedData = paymasterAndData[PAYMASTER_DATA_OFFSET:];
        (config.token, config.maxTokenFee, config.validUntil, config.validAfter, config.mode) =
            abi.decode(encodedData, (address, uint256, uint48, uint48, FeeMode));
    }

    function quoteTokenFee(address token, uint256 nativeWeiCost) external view returns (uint256) {
        TokenWhitelist.TokenConfig memory tokenConfig = tokenWhitelist.requireEnabled(token);
        return oracleManager.quoteTokenFee(token, nativeWeiCost, tokenConfig.maxSlippageBps);
    }

    function _setManagers(
        TokenWhitelist newTokenWhitelist,
        OracleManager newOracleManager,
        TreasuryManager newTreasuryManager
    ) internal {
        require(address(newTokenWhitelist) != address(0), "StablecoinPaymaster: whitelist is zero");
        require(address(newOracleManager) != address(0), "StablecoinPaymaster: oracle is zero");
        require(address(newTreasuryManager) != address(0), "StablecoinPaymaster: treasury is zero");

        tokenWhitelist = newTokenWhitelist;
        oracleManager = newOracleManager;
        treasuryManager = newTreasuryManager;

        emit ManagersUpdated(address(newTokenWhitelist), address(newOracleManager), address(newTreasuryManager));
    }
}
