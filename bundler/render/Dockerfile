FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git
RUN git clone --depth 1 https://github.com/transeptorlabs/transeptor-bundler.git .
RUN sed -i 's/1337: MAINNET_CONFIG,/1337: MAINNET_CONFIG,\\n    1336: MAINNET_CONFIG,/' src/gas/pre-verification-gas.ts
RUN sed -i 's/\\[1, 31337, 1337, 11155111\\]/[1, 31337, 1337, 1336, 11155111]/' src/provider/provider-service.ts

ENV NODE_ENV=production
RUN corepack enable && corepack prepare yarn@4.7.0 --activate
RUN yarn install --frozen-lockfile --immutable && yarn build

FROM node:22-alpine AS deps

WORKDIR /app

RUN apk add --no-cache git
RUN git clone --depth 1 https://github.com/transeptorlabs/transeptor-bundler.git .
RUN sed -i 's/1337: MAINNET_CONFIG,/1337: MAINNET_CONFIG,\\n    1336: MAINNET_CONFIG,/' src/gas/pre-verification-gas.ts
RUN sed -i 's/\\[1, 31337, 1337, 11155111\\]/[1, 31337, 1337, 1336, 11155111]/' src/provider/provider-service.ts

RUN corepack enable && corepack prepare yarn@4.7.0 --activate
RUN yarn workspaces focus --production --all

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules

EXPOSE 4337

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN mkdir -p /app/logs && \
    touch /app/logs/audit.log && \
    chown -R appuser:appgroup /app/logs && \
    chmod 755 /app/logs && \
    chmod 644 /app/logs/audit.log

USER appuser

ENTRYPOINT ["sh", "-c", "node ./dist/cli.mjs --httpApi web3,eth,debug --txMode base --port ${PORT:-4337} --minBalance ${BUNDLER_MIN_BALANCE:-0.01} --network ${KII_RPC_URL:-https://json-rpc.uno.sentry.testnet.v3.kiivalidator.com/} --auto --unsafe"]
