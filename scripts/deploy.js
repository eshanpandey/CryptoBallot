// Deploys the Election contract using ballot.config.json and writes the address + ABI
// to frontend/src/deployments/<network>.json so the web app picks it up automatically.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const config = require("../ballot.config.json");
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error(`No deployer account for network "${hre.network.name}". Set DEPLOYER_PRIVATE_KEY.`);

  const duration = Math.round((config.durationDays || 0) * 24 * 60 * 60);
  console.log(`Deploying "${config.title}" to ${hre.network.name} from ${deployer.address}...`);

  const election = await hre.ethers.deployContract("Election", [
    config.title,
    config.candidates,
    duration,
    Boolean(config.restricted),
  ]);
  await election.waitForDeployment();
  const receipt = await election.deploymentTransaction().wait();
  const address = await election.getAddress();
  const { chainId } = await hre.ethers.provider.getNetwork();
  console.log(`Election deployed at ${address} (block ${receipt.blockNumber})`);

  const artifact = await hre.artifacts.readArtifact("Election");
  const outFile = path.join(__dirname, "..", "frontend", "src", "deployments", `${hre.network.name}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        network: hre.network.name,
        chainId: Number(chainId),
        address,
        deployBlock: receipt.blockNumber,
        deployedAt: new Date().toISOString(),
        abi: artifact.abi,
      },
      null,
      2
    ) + "\n"
  );
  console.log(`Wrote ${path.relative(process.cwd(), outFile)}`);

  if (hre.network.name === "sepolia" && process.env.ETHERSCAN_API_KEY) {
    console.log("Waiting for Etherscan to index the contract before verifying...");
    await election.deploymentTransaction().wait(5);
    try {
      await hre.run("verify:verify", {
        address,
        constructorArguments: [config.title, config.candidates, duration, Boolean(config.restricted)],
      });
    } catch (err) {
      console.warn(`Verification skipped: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
