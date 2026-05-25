@echo off
REM KiiFlow Smart Contracts - Setup & Deployment Guide (Windows)

echo KiiFlow Smart Contracts Setup
echo ==============================
echo.

REM Step 1: Check if npm packages are installed
if not exist "node_modules" (
    echo Step 1: Installing dependencies...
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo ❌ npm install failed. Check your network connection and try again.
        exit /b 1
    )
    echo ✅ Dependencies installed
) else (
    echo ✅ Dependencies already installed
)

echo.
echo Step 2: Compiling Solidity contracts...
call npx hardhat compile
if errorlevel 1 (
    echo ❌ Compilation failed
    exit /b 1
)
echo ✅ Contracts compiled successfully

echo.
echo Step 3: Checking environment configuration...
if not exist ".env" (
    echo ⚠️  .env file not found. Creating from template...
    copy .env.example .env
    echo.
    echo 📝 Please edit .env and add:
    echo    - KII_RPC_URL: Your KiiChain testnet RPC endpoint
    echo    - DEPLOYER_PRIVATE_KEY: Your wallet private key
    echo.
    echo After configuring, run this script again.
    exit /b 0
)

echo ✅ .env file exists

echo.
echo Step 4: Testing contracts locally...
call npx hardhat test
if errorlevel 1 (
    echo ⚠️  Tests failed. Verify contract implementations.
    set /p continue="Continue with deployment? (y/n): "
    if not "!continue!"=="y" (
        exit /b 1
    )
)
echo ✅ Local tests passed

echo.
echo Step 5: Deploying to KiiChain Testnet...
echo This will deploy:
echo   - SimpleSwap (0.3%% fee)
echo   - LockVault
echo.

set /p deploy="Proceed with deployment? (y/n): "
if not "!deploy!"=="y" (
    echo Deployment cancelled.
    exit /b 0
)

call npx hardhat run --network kiiChainTestnet scripts/deploy.ts
if errorlevel 1 (
    echo ❌ Deployment failed
    exit /b 1
)

echo.
echo Step 6: Exporting ABIs for frontend...
call npx hardhat compile
call npx ts-node scripts/export-abis.ts
if errorlevel 1 (
    echo ⚠️  ABI export had issues, but ABIs may still be generated
)
echo ✅ ABIs exported to abis/ directory

echo.
echo ==========================================
echo ✅ Deployment Complete!
echo ==========================================
echo.
echo 📋 Next steps:
echo.
echo 1. Check deployments/kiiChainTestnet.json for deployed addresses
echo.
echo 2. Update frontend environment variables:
echo    - NEXT_PUBLIC_SIMPLE_SWAP_ADDRESS
echo    - NEXT_PUBLIC_LOCK_VAULT_ADDRESS
echo.
echo 3. Verify contract configuration:
echo    npx hardhat console --network kiiChainTestnet
echo    ^> const swap = await ethers.getContractAt('SimpleSwap', '0x...')
echo    ^> await swap.feeBps()
echo.
echo 4. Test swap and lock flows in frontend
echo.
