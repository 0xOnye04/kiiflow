// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

contract LockVault {
    address public owner;
    uint256 public nextPositionId;

    struct Position {
        address token;
        address owner;
        uint256 amount;
        uint256 reward;
        uint256 unlockTimestamp;
        bool withdrawn;
    }

    mapping(uint256 => Position) public positions;
    mapping(uint256 => uint256) public rewardBpsByDays;
    mapping(address => bool) public supportedTokens;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TokenSupportChanged(address indexed token, bool supported);
    event RewardRateSet(uint256 lockDays, uint256 rewardBps);
    event TokenLocked(uint256 indexed positionId, address indexed account, address indexed token, uint256 amount, uint256 unlockTimestamp, uint256 reward);
    event TokenWithdrawn(uint256 indexed positionId, address indexed account, address indexed token, uint256 amount, uint256 reward);

    modifier onlyOwner() {
        require(msg.sender == owner, "LockVault: caller is not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        nextPositionId = 1;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "LockVault: new owner is the zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setSupportedToken(address token, bool supported) external onlyOwner {
        require(token != address(0), "LockVault: token is the zero address");
        supportedTokens[token] = supported;
        emit TokenSupportChanged(token, supported);
    }

    function setRewardRate(uint256 lockDays, uint256 rewardBps) external onlyOwner {
        require(lockDays > 0, "LockVault: lockDays must be greater than zero");
        require(rewardBps <= 2000, "LockVault: reward rate too high");
        rewardBpsByDays[lockDays] = rewardBps;
        emit RewardRateSet(lockDays, rewardBps);
    }

    function lock(address token, uint256 amount, uint256 lockDays) external returns (uint256) {
        require(supportedTokens[token], "LockVault: token not supported");
        require(amount > 0, "LockVault: amount must be greater than zero");
        uint256 rewardBps = rewardBpsByDays[lockDays];
        require(rewardBps > 0, "LockVault: lock duration not configured");

        uint256 reward = (amount * rewardBps) / 10000;
        uint256 unlockTimestamp = block.timestamp + lockDays * 1 days;
        uint256 positionId = nextPositionId++;

        positions[positionId] = Position({
            token: token,
            owner: msg.sender,
            amount: amount,
            reward: reward,
            unlockTimestamp: unlockTimestamp,
            withdrawn: false
        });

        IERC20(token).transferFrom(msg.sender, address(this), amount);

        emit TokenLocked(positionId, msg.sender, token, amount, unlockTimestamp, reward);
        return positionId;
    }

    function withdraw(uint256 positionId) external returns (uint256) {
        Position storage position = positions[positionId];
        require(position.owner == msg.sender, "LockVault: caller is not the position owner");
        require(!position.withdrawn, "LockVault: position already withdrawn");
        require(block.timestamp >= position.unlockTimestamp, "LockVault: position is still locked");

        position.withdrawn = true;
        uint256 total = position.amount + position.reward;
        IERC20(position.token).transfer(position.owner, total);

        emit TokenWithdrawn(positionId, position.owner, position.token, position.amount, position.reward);
        return total;
    }

    function getPosition(uint256 positionId) external view returns (Position memory) {
        return positions[positionId];
    }
}
