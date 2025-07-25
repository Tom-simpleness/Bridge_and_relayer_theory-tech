import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("Starting user simulation...");

  // 1. Setup
  const [_owner, _relayer, user] = await ethers.getSigners();
  console.log(`User address: ${user.address}`);

  // 2. Read deployed contract addresses
  const addressesPath = path.join(__dirname, "deployed-addresses.json");
  if (!fs.existsSync(addressesPath)) {
    console.error(
      "Could not find deployed-addresses.json. Please run the relayer script first."
    );
    process.exit(1);
  }
  const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf-8"));
  console.log("Successfully read contract addresses.");

  // 3. Get contract instances
  const sourceToken = await ethers.getContractAt(
    "ERC20Mock",
    addresses.sourceToken,
    user
  );
  const sourceBridge = await ethers.getContractAt(
    "BridgeSourceChain",
    addresses.sourceBridge,
    user
  );

  // 4. Mint some source tokens for the user
  // Note: In a real scenario, the user would already have tokens.
  // Here, we need the owner to mint them.
  const ownerSigner = (await ethers.getSigners())[0];
  const sourceTokenOwner = await ethers.getContractAt(
    "ERC20Mock",
    addresses.sourceToken,
    ownerSigner
  );
  const amount = ethers.parseUnits("100", 18);

  console.log(
    `\nMinting ${ethers.formatUnits(amount, 18)} STK for the user...`
  );
  const mintTx = await sourceTokenOwner.mint(user.address, amount);
  await mintTx.wait();
  console.log("Minting complete.");

  // 5. User approves the source bridge to spend their tokens
  console.log("User approving source bridge...");
  const approveTx = await sourceToken.approve(addresses.sourceBridge, amount);
  await approveTx.wait();
  console.log("Approval complete.");

  // 6. User locks tokens on the source bridge
  console.log("User locking tokens...");
  const lockTx = await sourceBridge.lock(amount, user.address);
  await lockTx.wait();
  console.log(
    "Lock transaction sent! Check the relayer terminal for activity."
  );

  // --- Add a delay to simulate waiting for the relayer and transaction confirmation ---
  console.log("\nWaiting for 5 seconds before starting the return journey...");
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log("------------------------------------------------------");

  // 7. Get wrapped token contract instance for the user
  const wrappedToken = await ethers.getContractAt(
    "ERC20Mock",
    addresses.wrappedToken,
    user
  );

  // 8. User approves the destination bridge to burn their wrapped tokens
  console.log("\nUser approving destination bridge to burn wrapped tokens...");
  const approveBurnTx = await wrappedToken.approve(
    addresses.destBridge,
    amount
  );
  await approveBurnTx.wait();
  console.log("Approval complete.");

  // 9. User burns wrapped tokens on the destination bridge
  console.log("User burning wrapped tokens...");
  const destBridge = await ethers.getContractAt(
    "BridgeDestinationChain",
    addresses.destBridge,
    user
  );
  const burnTx = await destBridge.burn(amount, user.address);
  await burnTx.wait();
  console.log(
    "Burn transaction sent! Check the relayer terminal for the release activity."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
