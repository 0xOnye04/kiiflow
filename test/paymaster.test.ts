import { expect } from "chai";
import hre from "hardhat";

const { ethers, network } = hre;

const PACK_MASK = (BigInt(1) << BigInt(128)) - BigInt(1);

function packUint128Pair(high: bigint, low: bigint) {
  expect(high).to.be.lte(PACK_MASK);
  expect(low).to.be.lte(PACK_MASK);
  return ethers.toBeHex((high << BigInt(128)) | low, 32);
}

function unpackGasFees(gasFees: string) {
  const value = BigInt(gasFees);
  return {
    maxPriorityFeePerGas: value >> BigInt(128),
    maxFeePerGas: value & PACK_MASK
  };
}

function encodePaymasterAndData({
  paymaster,
  feeToken,
  maxFeeToken,
  validUntil = 0,
  validAfter = 0,
  mode = 1,
  paymasterVerificationGasLimit = BigInt(160_000),
  paymasterPostOpGasLimit = BigInt(120_000)
}: {
  paymaster: string;
  feeToken: string;
  maxFeeToken: bigint;
  validUntil?: number;
  validAfter?: number;
  mode?: number;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
}) {
  return ethers.solidityPacked(
    ["address", "uint128", "uint128", "bytes"],
    [
      paymaster,
      paymasterVerificationGasLimit,
      paymasterPostOpGasLimit,
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint48", "uint48", "uint8"],
        [feeToken, maxFeeToken, validUntil, validAfter, mode]
      )
    ]
  );
}

async function deployFixture() {
  const [owner, user, bundler, beneficiary, merchant] = await ethers.getSigners();

  const EntryPoint = await ethers.getContractFactory("OfficialEntryPoint");
  const entryPoint = await EntryPoint.deploy();
  await entryPoint.waitForDeployment();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
  const usdt = await MockERC20.deploy("Tether USD", "USDT", 6);
  await usdc.waitForDeployment();
  await usdt.waitForDeployment();

  const TokenWhitelist = await ethers.getContractFactory("TokenWhitelist");
  const tokenWhitelist = await TokenWhitelist.deploy(owner.address);
  await tokenWhitelist.waitForDeployment();

  const OracleManager = await ethers.getContractFactory("OracleManager");
  const oracleManager = await OracleManager.deploy(owner.address);
  await oracleManager.waitForDeployment();

  const TreasuryManager = await ethers.getContractFactory("TreasuryManager");
  const treasuryManager = await TreasuryManager.deploy(await entryPoint.getAddress(), owner.address, bundler.address);
  await treasuryManager.waitForDeployment();

  const StablecoinPaymaster = await ethers.getContractFactory("StablecoinPaymaster");
  const paymaster = await StablecoinPaymaster.deploy(
    await entryPoint.getAddress(),
    await tokenWhitelist.getAddress(),
    await oracleManager.getAddress(),
    await treasuryManager.getAddress()
  );
  await paymaster.waitForDeployment();
  await treasuryManager.setPaymaster(await paymaster.getAddress());

  const Simple4337Account = await ethers.getContractFactory("Simple4337Account");
  const account = await Simple4337Account.deploy(user.address, await entryPoint.getAddress());
  await account.waitForDeployment();

  await tokenWhitelist.setToken(await usdc.getAddress(), 6, ethers.parseUnits("5", 6), 1_000, true);
  await tokenWhitelist.setToken(await usdt.getAddress(), 6, ethers.parseUnits("5", 6), 1_000, true);
  await oracleManager.setTokenPrice(await usdc.getAddress(), ethers.parseUnits("1", 6), 3600, true);
  await oracleManager.setTokenPrice(await usdt.getAddress(), ethers.parseUnits("1", 6), 3600, true);

  await paymaster.deposit({ value: ethers.parseEther("3") });
  await paymaster.addStake(1, { value: ethers.parseEther("1") });

  await usdc.mint(await account.getAddress(), ethers.parseUnits("1000", 6));
  await usdt.mint(await account.getAddress(), ethers.parseUnits("1000", 6));

  return {
    owner,
    user,
    bundler,
    beneficiary,
    merchant,
    entryPoint,
    usdc,
    usdt,
    tokenWhitelist,
    oracleManager,
    treasuryManager,
    paymaster,
    account
  };
}

async function buildUserOp({
  entryPoint,
  account,
  paymaster,
  feeToken,
  target,
  targetData,
  maxFeeToken,
  mode = 1,
  callGasLimit = BigInt(250_000),
  verificationGasLimit = BigInt(250_000),
  paymasterVerificationGasLimit = BigInt(200_000),
  paymasterPostOpGasLimit = BigInt(160_000),
  preVerificationGas = BigInt(80_000),
  maxFeePerGas = ethers.parseUnits("1", "gwei"),
  maxPriorityFeePerGas = ethers.parseUnits("1", "gwei"),
  validUntil = 0
}: {
  entryPoint: any;
  account: any;
  paymaster: any;
  feeToken: string;
  target: string;
  targetData: string;
  maxFeeToken: bigint;
  mode?: number;
  callGasLimit?: bigint;
  verificationGasLimit?: bigint;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
  preVerificationGas?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  validUntil?: number;
}) {
  const sender = await account.getAddress();
  const nonce = await entryPoint.getNonce(sender, 0);
  const callData = account.interface.encodeFunctionData("execute", [target, 0, targetData]);

  return {
    sender,
    nonce,
    initCode: "0x",
    callData,
    accountGasLimits: packUint128Pair(verificationGasLimit, callGasLimit),
    preVerificationGas,
    gasFees: packUint128Pair(maxPriorityFeePerGas, maxFeePerGas),
    paymasterAndData: encodePaymasterAndData({
      paymaster: await paymaster.getAddress(),
      feeToken,
      maxFeeToken,
      mode,
      validUntil,
      paymasterVerificationGasLimit,
      paymasterPostOpGasLimit
    }),
    signature: "0x"
  };
}

async function signUserOp(entryPoint: any, user: any, userOp: any) {
  const userOpHash = await entryPoint.getUserOpHash(userOp);
  return user.signMessage(ethers.getBytes(userOpHash));
}

async function withSignature(entryPoint: any, user: any, userOp: any) {
  return { ...userOp, signature: await signUserOp(entryPoint, user, userOp) };
}

async function approveTreasuryWithSponsorMode(fixture: Awaited<ReturnType<typeof deployFixture>>, token: any, allowance: bigint) {
  const { user, bundler, beneficiary, entryPoint, account, paymaster, treasuryManager } = fixture;
  const approveData = token.interface.encodeFunctionData("approve", [await treasuryManager.getAddress(), allowance]);
  const op = await withSignature(
    entryPoint,
    user,
    await buildUserOp({
      entryPoint,
      account,
      paymaster,
      feeToken: await token.getAddress(),
      target: await token.getAddress(),
      targetData: approveData,
      maxFeeToken: 0,
      mode: 0
    })
  );

  await entryPoint.connect(bundler).handleOps([op], beneficiary.address);
}

describe("StablecoinPaymaster with real ERC-4337 EntryPoint", function () {
  it("sponsors the initial approval, then deducts USDC fees for a gasless transfer", async function () {
    const fixture = await deployFixture();
    const { user, bundler, beneficiary, merchant, entryPoint, usdc, account, paymaster, treasuryManager } = fixture;

    await approveTreasuryWithSponsorMode(fixture, usdc, ethers.parseUnits("100", 6));

    await network.provider.send("hardhat_setBalance", [user.address, "0x0"]);
    await network.provider.send("hardhat_setBalance", [await account.getAddress(), "0x0"]);

    const transferAmount = ethers.parseUnits("25", 6);
    const targetData = usdc.interface.encodeFunctionData("transfer", [merchant.address, transferAmount]);
    const op = await withSignature(
      entryPoint,
      user,
      await buildUserOp({
        entryPoint,
        account,
        paymaster,
        feeToken: await usdc.getAddress(),
        target: await usdc.getAddress(),
        targetData,
        maxFeeToken: ethers.parseUnits("5", 6)
      })
    );

    const treasuryBefore = await usdc.balanceOf(await treasuryManager.getAddress());
    const beneficiaryBefore = await ethers.provider.getBalance(beneficiary.address);

    await expect(entryPoint.connect(bundler).handleOps([op], beneficiary.address))
      .to.emit(entryPoint, "UserOperationEvent")
      .and.to.emit(paymaster, "StablecoinFeeSettled");

    expect(await usdc.balanceOf(merchant.address)).to.equal(transferAmount);
    expect(await usdc.balanceOf(await treasuryManager.getAddress())).to.be.gt(treasuryBefore);
    expect(await ethers.provider.getBalance(beneficiary.address)).to.be.gt(beneficiaryBefore);
    expect(await ethers.provider.getBalance(user.address)).to.equal(0);
    expect(await ethers.provider.getBalance(await account.getAddress())).to.equal(0);
  });

  it("settles stablecoin fees in postOp even when user execution fails", async function () {
    const fixture = await deployFixture();
    const { user, bundler, beneficiary, merchant, entryPoint, usdc, account, paymaster, treasuryManager } = fixture;

    await approveTreasuryWithSponsorMode(fixture, usdc, ethers.parseUnits("100", 6));

    const impossibleTransfer = ethers.parseUnits("999999", 6);
    const targetData = usdc.interface.encodeFunctionData("transfer", [merchant.address, impossibleTransfer]);
    const op = await withSignature(
      entryPoint,
      user,
      await buildUserOp({
        entryPoint,
        account,
        paymaster,
        feeToken: await usdc.getAddress(),
        target: await usdc.getAddress(),
        targetData,
        maxFeeToken: ethers.parseUnits("5", 6)
      })
    );

    const treasuryBefore = await usdc.balanceOf(await treasuryManager.getAddress());

    await expect(entryPoint.connect(bundler).handleOps([op], beneficiary.address)).to.emit(
      entryPoint,
      "UserOperationRevertReason"
    );
    expect(await usdc.balanceOf(await treasuryManager.getAddress())).to.be.gt(treasuryBefore);
    expect(await usdc.balanceOf(merchant.address)).to.equal(0);
  });

  it("converts collected USDC into KII and refills the paymaster EntryPoint deposit", async function () {
    const fixture = await deployFixture();
    const { user, bundler, beneficiary, merchant, entryPoint, usdc, account, paymaster, treasuryManager } = fixture;

    await approveTreasuryWithSponsorMode(fixture, usdc, ethers.parseUnits("100", 6));

    const targetData = usdc.interface.encodeFunctionData("transfer", [merchant.address, ethers.parseUnits("10", 6)]);
    const op = await withSignature(
      entryPoint,
      user,
      await buildUserOp({
        entryPoint,
        account,
        paymaster,
        feeToken: await usdc.getAddress(),
        target: await usdc.getAddress(),
        targetData,
        maxFeeToken: ethers.parseUnits("5", 6)
      })
    );
    await entryPoint.connect(bundler).handleOps([op], beneficiary.address);

    const collectedUsdc = await usdc.balanceOf(await treasuryManager.getAddress());
    expect(collectedUsdc).to.be.gt(0);

    const MockKiiSettlementRouter = await ethers.getContractFactory("MockKiiSettlementRouter");
    const router = await MockKiiSettlementRouter.deploy(beneficiary.address);
    await router.waitForDeployment();
    await router.setRate(await usdc.getAddress(), BigInt(1_000_000_000_000));
    await bundler.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("1") });

    const expectedKiiOut = collectedUsdc * BigInt(1_000_000_000_000);
    const depositBefore = await entryPoint.balanceOf(await paymaster.getAddress());

    await expect(
      treasuryManager
        .connect(bundler)
        .convertAndRefill(await router.getAddress(), await usdc.getAddress(), collectedUsdc, expectedKiiOut)
    )
      .to.emit(treasuryManager, "StablecoinConvertedAndRefilled")
      .withArgs(await usdc.getAddress(), await router.getAddress(), collectedUsdc, expectedKiiOut);

    expect(await usdc.balanceOf(await treasuryManager.getAddress())).to.equal(0);
    expect(await entryPoint.balanceOf(await paymaster.getAddress())).to.equal(depositBefore + expectedKiiOut);
  });

  it("rejects stale prices, disabled tokens, missing allowance, and expired paymaster data before execution", async function () {
    const fixture = await deployFixture();
    const { owner, user, bundler, beneficiary, merchant, entryPoint, usdc, usdt, account, paymaster, oracleManager, tokenWhitelist } =
      fixture;
    const targetData = usdc.interface.encodeFunctionData("transfer", [merchant.address, ethers.parseUnits("1", 6)]);

    const noAllowanceOp = await withSignature(
      entryPoint,
      user,
      await buildUserOp({
        entryPoint,
        account,
        paymaster,
        feeToken: await usdc.getAddress(),
        target: await usdc.getAddress(),
        targetData,
        maxFeeToken: ethers.parseUnits("5", 6)
      })
    );

    await expect(entryPoint.connect(bundler).handleOps([noAllowanceOp], beneficiary.address)).to.be.revertedWithCustomError(
      entryPoint,
      "FailedOpWithRevert"
    );

    await approveTreasuryWithSponsorMode(fixture, usdc, ethers.parseUnits("100", 6));

    await tokenWhitelist.connect(owner).setToken(await usdt.getAddress(), 6, ethers.parseUnits("5", 6), 1_000, false);
    const disabledTokenOp = await withSignature(
      entryPoint,
      user,
      await buildUserOp({
        entryPoint,
        account,
        paymaster,
        feeToken: await usdt.getAddress(),
        target: await usdc.getAddress(),
        targetData,
        maxFeeToken: ethers.parseUnits("5", 6)
      })
    );

    await expect(entryPoint.connect(bundler).handleOps([disabledTokenOp], beneficiary.address)).to.be.revertedWithCustomError(
      entryPoint,
      "FailedOpWithRevert"
    );

    const expiredOp = await withSignature(
      entryPoint,
      user,
      await buildUserOp({
        entryPoint,
        account,
        paymaster,
        feeToken: await usdc.getAddress(),
        target: await usdc.getAddress(),
        targetData,
        maxFeeToken: ethers.parseUnits("5", 6),
        validUntil: 1
      })
    );

    await expect(entryPoint.connect(bundler).handleOps([expiredOp], beneficiary.address)).to.be.revertedWithCustomError(
      entryPoint,
      "FailedOpWithRevert"
    );

    await oracleManager.connect(owner).setTokenPrice(await usdc.getAddress(), ethers.parseUnits("1", 6), 1, true);
    await network.provider.send("evm_increaseTime", [2]);
    await network.provider.send("evm_mine");

    const stalePriceOp = await withSignature(
      entryPoint,
      user,
      await buildUserOp({
        entryPoint,
        account,
        paymaster,
        feeToken: await usdc.getAddress(),
        target: await usdc.getAddress(),
        targetData,
        maxFeeToken: ethers.parseUnits("5", 6)
      })
    );

    await expect(entryPoint.connect(bundler).handleOps([stalePriceOp], beneficiary.address)).to.be.revertedWithCustomError(
      entryPoint,
      "FailedOpWithRevert"
    );
  });

  it("uses EntryPoint nonces to prevent replay", async function () {
    const fixture = await deployFixture();
    const { user, bundler, beneficiary, merchant, entryPoint, usdc, account, paymaster } = fixture;

    await approveTreasuryWithSponsorMode(fixture, usdc, ethers.parseUnits("100", 6));

    const targetData = usdc.interface.encodeFunctionData("transfer", [merchant.address, ethers.parseUnits("1", 6)]);
    const op = await withSignature(
      entryPoint,
      user,
      await buildUserOp({
        entryPoint,
        account,
        paymaster,
        feeToken: await usdc.getAddress(),
        target: await usdc.getAddress(),
        targetData,
        maxFeeToken: ethers.parseUnits("5", 6)
      })
    );

    await entryPoint.connect(bundler).handleOps([op], beneficiary.address);
    await expect(entryPoint.connect(bundler).handleOps([op], beneficiary.address)).to.be.revertedWithCustomError(
      entryPoint,
      "FailedOp"
    );
  });

  it("quotes USDC and USDT through whitelist and oracle managers", async function () {
    const { usdc, usdt, paymaster } = await deployFixture();
    const nativeCost = ethers.parseEther("0.0002");

    const usdcFee = await paymaster.quoteTokenFee(await usdc.getAddress(), nativeCost);
    const usdtFee = await paymaster.quoteTokenFee(await usdt.getAddress(), nativeCost);

    expect(usdcFee).to.equal(usdtFee);
    expect(usdcFee).to.be.gt(0);
  });
});
