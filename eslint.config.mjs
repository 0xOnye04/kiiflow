import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: ["artifacts/**", "cache/**", "typechain-types/**", "node_modules/**", "bundler/source/**"]
  },
  ...nextVitals
];

export default config;
