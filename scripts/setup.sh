#!/bin/bash

# KiiFlow Smart Contracts - Setup & Deployment Guide

echo "KiiFlow Smart Contracts Setup"
echo "=============================="
echo ""

# Step 1: Check if npm packages are installed
if [ ! -d "node_modules" ]; then
    echo "Step 1: Installing dependencies..."
    npm install --legacy-peer-deps
    if [ $? -ne 0 ]; then
        echo "❌ npm install failed. Check your network connection and try again."
        exit 1
    fi
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

echo ""
echo "Step 2: Compiling Solidity contracts..."
npx hardhat compile
if [ $? -ne 0 ]; then
    echo "❌ Compilation failed"
    exit 1
fi
echo "✅ Contracts compiled successfully"

echo ""
echo "Step 3: Checking environment configuration..."
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating from template..."
    cp .env.example .env
    echo ""
    echo "📝 Please edit .env and add:"
    echo "   - KII_RPC_URL: Your KiiChain testnet RPC endpoint"
    echo "   - DEPLOYER_PRIVATE_KEY: Your wallet private key"
    echo ""
    echo "After configuring, run this script again."
    exit 0
fi

echo "✅ .env file exists"

echo ""
echo "Step 4: Testing contracts locally..."
npx hardhat test
if [ $? -ne 0 ]; then
    echo "⚠️  Tests failed. Verify contract implementations."
    read -p "Continue with deployment? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
echo "✅ Local tests passed"

echo ""
echo "Step 5: Deploying to KiiChain Testnet..."
echo "This will deploy:"
echo "  - SimpleSwap (0.3% fee)"
echo "  - LockVault"
echo ""

read -p "Proceed with deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

npx hardhat run --network kiiChainTestnet scripts/deploy.ts
if [ $? -ne 0 ]; then
    echo "❌ Deployment failed"
    exit 1
fi

echo ""
echo "Step 6: Exporting ABIs for frontend..."
npx hardhat compile
npx ts-node scripts/export-abis.ts
if [ $? -ne 0 ]; then
    echo "⚠️  ABI export had issues, but ABIs may still be generated"
fi
echo "✅ ABIs exported to abis/ directory"

echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Check deployments/kiiChainTestnet.json for deployed addresses"
echo ""
echo "2. Update frontend environment variables:"
echo "   - NEXT_PUBLIC_SIMPLE_SWAP_ADDRESS"
echo "   - NEXT_PUBLIC_LOCK_VAULT_ADDRESS"
echo ""
echo "3. Verify contract configuration:"
echo "   npx hardhat console --network kiiChainTestnet"
echo "   > const swap = await ethers.getContractAt('SimpleSwap', '0x...')"
echo "   > await swap.feeBps()"
echo ""
echo "4. Test swap and lock flows in frontend"
echo ""
