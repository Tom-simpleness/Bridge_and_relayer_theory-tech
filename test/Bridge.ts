import { ethers } from "hardhat";
import { expect } from "chai";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, ContractTransactionReceipt } from "ethers";
import {
  ERC20Mock,
  BridgeSourceChain,
  BridgeDestinationChain,
} from "../typechain-types";

describe("Bridge", function () {
  let owner: HardhatEthersSigner;
  let user: HardhatEthersSigner;
  let relayer: HardhatEthersSigner;

  let sourceToken: ERC20Mock;
  let wrappedToken: ERC20Mock;
  let sourceBridge: BridgeSourceChain;
  let destBridge: BridgeDestinationChain;

  beforeEach(async function () {
    [owner, user, relayer] = await ethers.getSigners();

    const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    sourceToken = await ERC20MockFactory.deploy("Source Token", "STK");
    wrappedToken = await ERC20MockFactory.deploy("Wrapped Token", "WTK");

    const BridgeSourceFactory = await ethers.getContractFactory(
      "BridgeSourceChain"
    );
    sourceBridge = await BridgeSourceFactory.deploy(
      await sourceToken.getAddress(),
      await relayer.getAddress()
    );

    const BridgeDestFactory = await ethers.getContractFactory(
      "BridgeDestinationChain"
    );
    destBridge = await BridgeDestFactory.deploy(
      await wrappedToken.getAddress(),
      await relayer.getAddress()
    );

    // Grant minting/burning rights to the destination bridge
    // We need to connect as the owner of the wrappedToken contract to transfer ownership
    await wrappedToken
      .connect(owner)
      .transferOwnership(await destBridge.getAddress());
  });

  it("should allow a user to lock tokens and receive wrapped tokens", async function () {
    const amount = ethers.parseUnits("100", 18);

    // 1. Mint source tokens to the user
    await sourceToken.mint(user.address, amount);

    // 2. User approves the source bridge to spend their tokens
    await sourceToken
      .connect(user)
      .approve(await sourceBridge.getAddress(), amount);

    // 3. User locks tokens on the source bridge
    const lockTx = await sourceBridge.connect(user).lock(amount, user.address);
    const receipt = await lockTx.wait();

    // 4. Simulate the relayer
    const filter = sourceBridge.filters.TokenLocked(user.address);
    const logs = await sourceBridge.queryFilter(filter, receipt?.blockNumber);
    const event = logs[0];

    const [eventUser, eventAmount, eventDestination] = event.args;

    // 4b. Relayer calls the destination bridge to mint wrapped tokens
    await destBridge
      .connect(relayer)
      .mintWrapped(eventDestination, eventAmount);

    // 5. Assert final balances
    expect(await sourceToken.balanceOf(user.address)).to.equal(0);
    expect(
      await sourceToken.balanceOf(await sourceBridge.getAddress())
    ).to.equal(amount);
    expect(await wrappedToken.balanceOf(user.address)).to.equal(amount);
  });

  it("should allow a user to burn wrapped tokens and receive original tokens", async function () {
    const amount = ethers.parseUnits("100", 18);

    // --- Setup: Lock and Mint first ---
    await sourceToken.mint(user.address, amount);
    await sourceToken
      .connect(user)
      .approve(await sourceBridge.getAddress(), amount);
    const lockTx = await sourceBridge.connect(user).lock(amount, user.address);
    let receipt = await lockTx.wait();
    const lockFilter = sourceBridge.filters.TokenLocked(user.address);
    let lockLogs = await sourceBridge.queryFilter(
      lockFilter,
      receipt?.blockNumber
    );
    let lockEvent = lockLogs[0];
    await destBridge
      .connect(relayer)
      .mintWrapped(lockEvent.args[2], lockEvent.args[1]);
    expect(await wrappedToken.balanceOf(user.address)).to.equal(amount);
    // --- End Setup ---

    // 1. User approves the destination bridge to burn their wrapped tokens
    await wrappedToken
      .connect(user)
      .approve(await destBridge.getAddress(), amount);

    // 2. User burns wrapped tokens on the destination bridge
    const burnTx = await destBridge.connect(user).burn(amount, user.address);
    receipt = await burnTx.wait();

    // 3. Simulate the relayer for the burn event
    const burnFilter = destBridge.filters.TokenBurned(user.address);
    const burnLogs = await destBridge.queryFilter(
      burnFilter,
      receipt?.blockNumber
    );
    const burnEvent = burnLogs[0];

    const [eventUser, eventAmount, eventDestination] = burnEvent.args;

    // 4. Relayer calls the source bridge to release original tokens
    await sourceBridge.connect(relayer).release(eventDestination, eventAmount);

    // 5. Assert final balances
    // User should have their original tokens back
    expect(await sourceToken.balanceOf(user.address)).to.equal(amount);
    // User's wrapped tokens should be gone
    expect(await wrappedToken.balanceOf(user.address)).to.equal(0);
    // Source bridge should have released the tokens
    expect(
      await sourceToken.balanceOf(await sourceBridge.getAddress())
    ).to.equal(0);
  });
});
