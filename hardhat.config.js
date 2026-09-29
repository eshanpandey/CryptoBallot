require("dotenv").config({ quiet: true });
require("@nomicfoundation/hardhat-toolbox");
const path = require("path");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

const SOLC_VERSION = "0.8.28";

// Compile with the solc-js build pinned in package.json instead of downloading a native
// compiler at build time, so compilation is reproducible and works in offline sandboxes.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async ({ solcVersion }, _hre, runSuper) => {
  if (solcVersion !== SOLC_VERSION) return runSuper();
  return {
    compilerPath: path.join(__dirname, "node_modules", "solc", "soljson.js"),
    isSolcJs: true,
    version: SOLC_VERSION,
    longVersion: require("solc/package.json").version,
  };
});

const { SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: SOLC_VERSION,
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: { apiKey: ETHERSCAN_API_KEY || "" },
  gasReporter: { enabled: Boolean(process.env.REPORT_GAS) },
};
