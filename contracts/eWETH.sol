// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { ERC7984 } from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import { FHE, externalEuint64, euint64 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract eWETH is SepoliaConfig, ERC7984 {
    event Deposit(address indexed dest, uint256 amount);
    event Withdrawal(address indexed source, euint64 amount);
    event WithdrawalRequested(address indexed source, uint256 indexed requestId);

    struct WithdrawalRequest {
        address user;
        bool isPending;
    }

    mapping(uint256 => WithdrawalRequest) public withdrawalRequests;

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

    function withdraw(externalEuint64 amount, bytes memory inputProof) external {
        euint64 eWithdrawnAmount = FHE.fromExternal(amount, inputProof);

        // Request decryption
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(eWithdrawnAmount);
        uint256 requestId = FHE.requestDecryption(cts, this.withdrawCallback.selector);

        // Store the withdrawal request
        withdrawalRequests[requestId] = WithdrawalRequest({
            user: msg.sender,
            isPending: true
        });

        _burn(msg.sender, eWithdrawnAmount);

        emit WithdrawalRequested(msg.sender, requestId);
    }

    function withdrawCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory decryptionProof
    ) external {
        // Verify signatures from KMS
        FHE.checkSignatures(requestId, cleartexts, decryptionProof);

        // Get the withdrawal request
        WithdrawalRequest storage request = withdrawalRequests[requestId];
        require(request.isPending, "Invalid or already processed request");

        // Decode the decrypted amount
        uint64 withdrawnAmount = abi.decode(cleartexts, (uint64));

        // Transfer ETH to the user
        (bool success, ) = request.user.call{value: withdrawnAmount}("");
        require(success, "ETH transfer failed");

        // Mark as processed
        request.isPending = false;

        emit Withdrawal(request.user, FHE.asEuint64(withdrawnAmount));
    }

}