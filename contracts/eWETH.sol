// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { FHE, externalEuint64, euint64 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { ERC7984 } from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";

contract eWETH is SepoliaConfig, ERC7984 {
    event Deposit(address indexed dest, uint256 amount);
    event Withdrawal(address indexed source, euint64 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        string memory tokenURI_
    ) ERC7984(name_, symbol_, tokenURI_) {}

    receive() external payable {
        deposit();
    }

    fallback() external payable{
        deposit();
    }

    function deposit() public payable {
        require(msg.value <= type(uint64).max, "Deposit amount exceeds uint64 max");
        euint64 eDepositedAmount = FHE.asEuint64(uint64(msg.value));
        _mint(msg.sender, eDepositedAmount);
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(address from, externalEuint64 amount, bytes memory inputProof) external {
        euint64 eWithdrawnAmount = FHE.fromExternal(amount, inputProof);
        _burn(from, FHE.fromExternal(amount, inputProof));
        emit Withdrawal(msg.sender, eWithdrawnAmount);
    }

}