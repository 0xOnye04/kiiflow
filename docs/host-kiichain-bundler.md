# Host KiiChain ERC-4337 Bundler

KiiChain does not currently give you a public ERC-4337 bundler URL, so KiiFlow needs a self-hosted Transeptor bundler.

The deployable Render bundler image lives here:

```txt
bundler/render
```

It clones Transeptor during deployment and injects the KiiChain support needed for chain ID `1336`.

## Recommended: Render

1. Push this repo to GitHub.

2. In Render, create a new **Web Service**.

3. Select this GitHub repo.

4. Use these settings:

```txt
Runtime: Docker
Root Directory: bundler/render
Dockerfile Path: Dockerfile
```

5. Add these environment variables in Render:

```env
KII_RPC_URL=https://json-rpc.uno.sentry.testnet.v3.kiivalidator.com/
BUNDLER_MIN_BALANCE=0.01
TRANSEPTOR_ENTRYPOINT_ADDRESS=0xC3412374BEf9Ea5De79022454c1802A5a58fB2B3
TRANSEPTOR_BENEFICIARY=YOUR_FUNDED_BUNDLER_WALLET_ADDRESS
TRANSEPTOR_MNEMONIC=YOUR_BUNDLER_WALLET_MNEMONIC
TRANSEPTOR_LOG_LEVEL=info
TRANSEPTOR_RECEIPT_LOOKBACK_BLOCKS=9000
TRANSEPTOR_MAX_LOG_BLOCK_RANGE=9000
```

Do not use your main wallet. Use a dedicated testnet bundler wallet funded with KII.

KiiChain RPC limits `eth_getLogs` requests to a maximum 10,000-block range. The receipt lookup variables above keep the bundler compatible by scanning recent EntryPoint events in safe chunks.

6. Deploy the service.

7. After Render deploys, your public bundler RPC will be:

```txt
https://YOUR_RENDER_SERVICE.onrender.com/rpc
```

8. Test it:

```bash
curl -X POST https://YOUR_RENDER_SERVICE.onrender.com/rpc \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

Expected result:

```json
"0x538"
```

`0x538` is KiiChain testnet chain ID `1336`.

9. Test the EntryPoint:

```bash
curl -X POST https://YOUR_RENDER_SERVICE.onrender.com/rpc \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_supportedEntryPoints","params":[]}'
```

Expected result includes:

```txt
0xC3412374BEf9Ea5De79022454c1802A5a58fB2B3
```

10. Add this to Vercel:

```env
NEXT_PUBLIC_BUNDLER_RPC_URL=https://YOUR_RENDER_SERVICE.onrender.com/rpc
```

## Important

The bundler wallet must stay funded with native KII, because the bundler submits `handleOps` transactions to the EntryPoint.

Never put `TRANSEPTOR_MNEMONIC`, private keys, or deployer keys in Vercel frontend environment variables.
