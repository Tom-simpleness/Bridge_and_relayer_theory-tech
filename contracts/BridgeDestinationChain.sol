// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./interfaces/IWrappedToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BridgeDestinationChain is Ownable {
    address public immutable wrappedToken;
    address public relayer;

    event TokenBurned(address indexed user, uint256 amount, address destination);

    modifier onlyRelayer() {
        require(msg.sender == relayer, "BridgeDest: Caller is not the relayer");
        _;
    }

    constructor(address wrappedTokenAddress, address relayerAddress) Ownable(msg.sender) {
        wrappedToken = wrappedTokenAddress;
        relayer = relayerAddress;
    }

    function setRelayer(address newRelayer) external onlyOwner {
        relayer = newRelayer;
    }

    function mintWrapped(address user, uint256 amount) external onlyRelayer {
        require(amount > 0, "BridgeDest: Amount must be greater than 0");
        IWrappedToken(wrappedToken).mint(user, amount);
    }

    function burn(uint256 amount, address destination) external {
        require(amount > 0, "BridgeDest: Amount must be greater than 0");
        IWrappedToken(wrappedToken).burnFrom(msg.sender, amount);
        emit TokenBurned(msg.sender, amount, destination);
    }
} 