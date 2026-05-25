import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

describe("SimpleSwap", function () {
  let simpleSwap: any;
  let owner: any, user: any;
  let token0: any, token1: any;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    token0 = await MockERC20.deploy("Token A", "TKA", 18);
    token1 = await MockERC20.deploy("Token B", "TKB", 6);
    await token0.waitForDeployment();
    await token1.waitForDeployment();

    // Deploy SimpleSwap
    const SimpleSwap = await ethers.getContractFactory("SimpleSwap");
    simpleSwap = await SimpleSwap.deploy(50); // 0.5% fee
    await simpleSwap.waitForDeployment();

    // Configure tokens
    await simpleSwap.setTokenConfig(token0.target, 18, true);
    await simpleSwap.setTokenConfig(token1.target, 6, true);

    // Set rate: 1 TKA = 2 TKB
    const rate = ethers.parseUnits("2", 18);
    await simpleSwap.setRate(token0.target, token1.target, rate);
    await simpleSwap.setRate(token1.target, token0.target, ethers.parseUnits("0.5", 18));

    // Mint tokens
    await token0.mint(user.address, ethers.parseUnits("1000", 18));
    await token1.mint(simpleSwap.target, ethers.parseUnits("2000", 6));

    // Approve swap contract
    await token0.connect(user).approve(simpleSwap.target, ethers.MaxUint256);
  });

  it("should estimate swap correctly", async function () {
    const amountIn = ethers.parseUnits("100", 18);
    const estimated = await simpleSwap.estimateAmountOut(token0.target, token1.target, amountIn);

    // 100 TKA * 2 = 200 TKB, minus 0.5% fee = 199 TKB
    const expected = ethers.parseUnits("199", 6);
    expect(estimated).to.be.closeTo(expected, ethers.parseUnits("1", 6));
  });

  it("should execute swap", async function () {
    const amountIn = ethers.parseUnits("100", 18);
    const minAmountOut = ethers.parseUnits("195", 6); // Allow some slippage

    const balanceBefore = await token1.balanceOf(user.address);
    await simpleSwap.connect(user).swap(token0.target, token1.target, amountIn, minAmountOut);
    const balanceAfter = await token1.balanceOf(user.address);

    expect(balanceAfter).to.be.gt(balanceBefore);
    expect(balanceAfter - balanceBefore).to.be.closeTo(ethers.parseUnits("199", 6), ethers.parseUnits("1", 6));
  });
});

describe("LockVault", function () {
  let lockVault: any;
  let owner: any, user: any;
  let token: any;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Deploy mock token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    token = await MockERC20.deploy("Staking Token", "STK", 18);
    await token.waitForDeployment();

    // Deploy LockVault
    const LockVault = await ethers.getContractFactory("LockVault");
    lockVault = await LockVault.deploy();
    await lockVault.waitForDeployment();

    // Configure
    await lockVault.setSupportedToken(token.target, true);
    await lockVault.setRewardRate(30, 1000); // 10% reward for 30 days

    // Mint and approve
    await token.mint(user.address, ethers.parseUnits("1000", 18));
    await token.connect(user).approve(lockVault.target, ethers.MaxUint256);

    // Mint reward supply to vault
    await token.mint(lockVault.target, ethers.parseUnits("500", 18));
  });

  it("should lock tokens", async function () {
    const amount = ethers.parseUnits("100", 18);
    const lockDays = 30;

    const tx = await lockVault.connect(user).lock(token.target, amount, lockDays);
    const receipt = await tx.wait();

    const positionId = 1;
    const position = await lockVault.getPosition(positionId);

    expect(position.owner).to.equal(user.address);
    expect(position.amount).to.equal(amount);
    expect(position.reward).to.equal(ethers.parseUnits("10", 18)); // 10% reward
    expect(position.withdrawn).to.be.false;
  });

  it("should prevent withdrawal before unlock", async function () {
    const amount = ethers.parseUnits("100", 18);
    await lockVault.connect(user).lock(token.target, amount, 30);

    const positionId = 1;
    await expect(lockVault.connect(user).withdraw(positionId)).to.be.revertedWith(
      "LockVault: position is still locked"
    );
  });

  it("should allow withdrawal after unlock", async function () {
    const amount = ethers.parseUnits("100", 18);
    const lockDays = 1; // 1 day
    await lockVault.setRewardRate(lockDays, 500); // 5% reward

    const tx = await lockVault.connect(user).lock(token.target, amount, lockDays);
    const receipt = await tx.wait();

    // Fast forward time
    await ethers.provider.send("hardhat_mine", ["0x" + (86400 + 1).toString(16)]);

    const positionId = 1;
    const balanceBefore = await token.balanceOf(user.address);
    await lockVault.connect(user).withdraw(positionId);
    const balanceAfter = await token.balanceOf(user.address);

    // Should receive amount + 5% reward
    const expected = amount + ethers.parseUnits("5", 18);
    expect(balanceAfter - balanceBefore).to.equal(expected);
  });
});
