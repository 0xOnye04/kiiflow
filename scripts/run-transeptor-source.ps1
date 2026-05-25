$ErrorActionPreference = "Stop"

$repoDir = Join-Path (Get-Location) "bundler\source\transeptor-bundler"
$envFile = Join-Path (Get-Location) "bundler\.env"

if (-not (Test-Path $envFile)) {
  throw "Missing bundler\.env. Run npm run bundler:init first."
}

if (-not (Test-Path $repoDir)) {
  throw "Missing $repoDir. Run npm run bundler:source:install first."
}

Copy-Item -LiteralPath $envFile -Destination (Join-Path $repoDir ".env") -Force

Set-Location $repoDir
corepack yarn tsx .\src\cli.ts --httpApi web3,eth,debug --txMode base --port 4337 --minBalance 0.01 --network https://json-rpc.uno.sentry.testnet.v3.kiivalidator.com/ --auto --unsafe
