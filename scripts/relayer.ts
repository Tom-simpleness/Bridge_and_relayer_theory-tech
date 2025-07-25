import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { Log } from "ethers";

async function main() {
  console.log("Starting relayer...");

  // 1. Setup
  const [owner, relayer, user] = await ethers.getSigners();
  console.log(`Relayer address: ${relayer.address}`);

  // 2. Deploy Contracts
  const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock", owner);
  const sourceToken = await ERC20MockFactory.deploy("Source Token", "STK");
  const wrappedToken = await ERC20MockFactory.deploy("Wrapped Token", "WTK");
  await sourceToken.waitForDeployment();
  await wrappedToken.waitForDeployment();
  console.log(`Source Token deployed to: ${await sourceToken.getAddress()}`);
  console.log(`Wrapped Token deployed to: ${await wrappedToken.getAddress()}`);

  const BridgeSourceFactory = await ethers.getContractFactory(
    "BridgeSourceChain",
    owner
  );
  const sourceBridge = await BridgeSourceFactory.deploy(
    await sourceToken.getAddress(),
    relayer.address
  );
  await sourceBridge.waitForDeployment();
  console.log(`Source Bridge deployed to: ${await sourceBridge.getAddress()}`);

  const BridgeDestFactory = await ethers.getContractFactory(
    "BridgeDestinationChain",
    owner
  );
  const destBridge = await BridgeDestFactory.deploy(
    await wrappedToken.getAddress(),
    relayer.address
  );
  await destBridge.waitForDeployment();
  console.log(
    `Destination Bridge deployed to: ${await destBridge.getAddress()}`
  );

  // Save addresses to a file
  const addresses = {
    sourceToken: await sourceToken.getAddress(),
    wrappedToken: await wrappedToken.getAddress(),
    sourceBridge: await sourceBridge.getAddress(),
    destBridge: await destBridge.getAddress(),
  };
  const addressesPath = path.join(__dirname, "deployed-addresses.json");
  fs.writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));
  console.log(`\nContract addresses saved to ${addressesPath}`);

  // Grant minting/burning rights to the destination bridge
  await wrappedToken.transferOwnership(await destBridge.getAddress());
  console.log("Destination Bridge now owns the Wrapped Token contract.");

  // 3. Setup Listeners
  console.log("\nListening for events...");

  sourceBridge.on(sourceBridge.filters.TokenLocked(), async (event) => {
    // The listener receives a single event object; its arguments are in the .args property.
    const [user, amount, destination] = (event as any).args;
    console.log(`\n---`);
    console.log(`[Source Chain] Detected TokenLocked event!`);
    console.log(`  > User: ${user}`);
    console.log(`  > Amount: ${ethers.formatUnits(amount, 18)}`);
    console.log(`  > Destination: ${destination}`);

    try {
      console.log("[Destination Chain] Calling mintWrapped...");
      const tx = await destBridge
        .connect(relayer)
        .mintWrapped(destination, amount);
      await tx.wait();
      console.log("[Destination Chain] mintWrapped successful!");
    } catch (error) {
      console.error("[Destination Chain] Error calling mintWrapped:", error);
    }
    console.log(`---`);
  });

  destBridge.on(destBridge.filters.TokenBurned(), async (event) => {
    // The listener receives a single event object; its arguments are in the .args property.
    const [user, amount, destination] = (event as any).args;
    console.log(`\n---`);
    console.log(`[Destination Chain] Detected TokenBurned event!`);
    console.log(`  > User: ${user}`);
    console.log(`  > Amount: ${ethers.formatUnits(amount, 18)}`);
    console.log(`  > Destination: ${destination}`);

    try {
      console.log("[Source Chain] Calling release...");
      const tx = await sourceBridge
        .connect(relayer)
        .release(destination, amount);
      await tx.wait();
      console.log("[Source Chain] release successful!");
    } catch (error) {
      console.error("[Source Chain] Error calling release:", error);
    }
    console.log(`---`);
  });

  // Keep the script running
  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
