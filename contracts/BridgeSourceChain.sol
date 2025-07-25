// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BridgeSourceChain is Ownable {
    address public immutable token;
    address public relayer;

    event TokenLocked(address indexed user, uint256 amount, address destination);

    modifier onlyRelayer() {
        require(msg.sender == relayer, "BridgeSource: Caller is not the relayer");
        _;
    }

    constructor(address tokenAddress, address relayerAddress) Ownable(msg.sender) {
        token = tokenAddress;
        relayer = relayerAddress;
    }

    function setRelayer(address newRelayer) external onlyOwner {
        relayer = newRelayer;
    }

    function lock(uint256 amount, address destination) external {
        require(amount > 0, "BridgeSource: Amount must be greater than 0");
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        emit TokenLocked(msg.sender, amount, destination);
    }

    function release(address user, uint256 amount) external onlyRelayer {
        require(amount > 0, "BridgeSource: Amount must be greater than 0");
        IERC20(token).transfer(user, amount);
    }
} 