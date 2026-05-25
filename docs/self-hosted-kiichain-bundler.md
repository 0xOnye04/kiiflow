# Self-Hosted ERC-4337 Bundler For KiiChain

KiiChain Testnet Oro does not currently expose a public ERC-4337 bundler. This repo includes a Docker setup for a self-hosted Transeptor bundler.

## Important Production Note

KiiChain public RPC currently does not support `debug_traceCall`. Safe ERC-4337 bundler operation normally needs tracing for ERC-7562 validation rules. Because of that, this Docker setup uses Transeptor `--unsafe` mode against the public KiiChain RPC.

Use this for testnet development. For production-safe operation, run the bundler against a KiiChain node/RPC that supports `debug_traceCall` with the ERC-7562 tracer and remove `--unsafe` from `bundler/docker-compose.yml`.

## Setup

Copy the env template:

```bash
copy bundler\.env.example bundler\.env
```

Edit `bundler/.env`:

```env
KII_RPC_URL=https://json-rpc.uno.sentry.testnet.v3.kiivalidator.com/
BUNDLER_PORT=4337
TRANSEPTOR_ENTRYPOINT_ADDRESS=0xC3412374BEf9Ea5De79022454c1802A5a58fB2B3
TRANSEPTOR_BENEFICIARY=0xYourBundlerWalletAddress
TRANSEPTOR_MNEMONIC=your throwaway testnet wallet mnemonic
```

Fund the bundler wallet with testnet KII. The bundler wallet pays native KII to submit `handleOps` transactions.

Start:

```bash
npm run bundler:up
```

Check:

```bash
npm run bundler:check
```

If the check passes, use this in your root `.env`:

```env
BUNDLER_RPC_URL=http://localhost:4337/rpc
```

Logs:

```bash
npm run bundler:logs
```

Stop:

```bash
npm run bundler:down
```

## Without Docker

If Docker Desktop is not available, run Transeptor from source:

```bash
npm run bundler:source:install
npm run bundler:source:run
```

This requires Node.js `>=22.14.0` and uses `corepack yarn`.
