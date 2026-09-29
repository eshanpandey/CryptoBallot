// Network metadata and deployment discovery. `npm run deploy:*` writes
// frontend/src/deployments/<network>.json, which is picked up here at build time.

export const NETWORKS = {
  11155111: {
    name: "Sepolia",
    rpcUrl: import.meta.env.VITE_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
    currency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  },
  31337: {
    name: "Localhost",
    rpcUrl: "http://127.0.0.1:8545",
    explorer: null,
    currency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
};

const deployments = import.meta.glob("./deployments/*.json", { eager: true, import: "default" });

function findDeployment() {
  const byName = Object.fromEntries(
    Object.entries(deployments).map(([file, data]) => [file.match(/([^/]+)\.json$/)[1], data])
  );
  const preferred = import.meta.env.VITE_NETWORK;
  if (preferred && byName[preferred]) return byName[preferred];
  // In `npm run dev` prefer a local node; production builds prefer the public testnet.
  const order = import.meta.env.DEV ? ["localhost", "sepolia"] : ["sepolia"];
  for (const name of order) if (byName[name]) return byName[name];
  return null;
}

export const deployment = findDeployment();
export const network = deployment ? NETWORKS[deployment.chainId] : null;

// Shown when no contract has been deployed yet, so the UI can still be previewed.
export const PREVIEW = {
  title: "Best Programming Language 2026",
  candidates: [
    { id: 1n, name: "Rust", voteCount: 42n },
    { id: 2n, name: "TypeScript", voteCount: 37n },
    { id: 3n, name: "Go", voteCount: 25n },
    { id: 4n, name: "Python", voteCount: 31n },
  ],
};
