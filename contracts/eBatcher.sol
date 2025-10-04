// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { FHE, euint64, externalEuint64, eaddress, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { IConfidentialFungibleToken } from "@openzeppelin/confidential-contracts/interfaces/IConfidentialFungibleToken.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract eBatcher is ReentrancyGuard, Ownable {
    uint16 public MAX_BATCH_SIZE = 50;
    
    event BatchTokenTransfer(address indexed sender, address indexed token, euint64 totalAmount, uint256 recipients);
    event TokenRescued(address indexed token, address indexed owner, euint64 amount);
    event NewMaxBatchSize(uint16 size);

    error InsufficientTokenAllowance();
    error InsufficientTokenBalance();
    error ArrayLengthMismatch();
    error BatchSizeExceeded();
    error ZeroAddress();
    error NoTokenToRescue();
    error ETHSendFailed();
    error RequireOneRecipient();
    error NotEnoughETH();
    error MinimumSizeIsTen();
    error MaximumSizeExceeded();
    error BatchFailed();

    constructor(address owner_) Ownable(owner_){}

    /*//////////////////////////////////////////////////////////////
                        ERC20 Tokens Batching 
    //////////////////////////////////////////////////////////////*/

    /// @notice Send the SAME token amount to many recipients
    /// @dev Duplicate recipients are allowed and will receive multiple transfers
    function batchSendTokenSameAmount(
        address token,
        address[] calldata recipients,
        externalEuint64 amountPerRecipient,
        bytes calldata inputProof
    ) external nonReentrant {
        if (token == address(0)) revert ZeroAddress();

        uint256 n = recipients.length;
        if (n == 0) revert RequireOneRecipient();
        if (n > MAX_BATCH_SIZE) revert BatchSizeExceeded();

        euint64 eAmountPerRecipient = FHE.fromExternal(amountPerRecipient, inputProof);
        FHE.allowThis(eAmountPerRecipient);
        FHE.allow(eAmountPerRecipient, msg.sender);

        IConfidentialFungibleToken tokenContract = IConfidentialFungibleToken(token);
        for (uint16 i = 0; i < n; ) {
            address to = recipients[i];
            if (to == address(0)) revert ZeroAddress();

            tokenContract.confidentialTransferFrom(msg.sender, to, eAmountPerRecipient);
            unchecked { ++i; }
        }

        // Calculate total for event
        euint64 eTotal = FHE.mul(eAmountPerRecipient, uint64(n));
        FHE.allowThis(eTotal);
        FHE.allow(eTotal, msg.sender);

        emit BatchTokenTransfer(msg.sender, token, eTotal, n);
    }

    /// @notice Send DIFFERENT token amounts to many recipients
    /// @dev Duplicate recipients are allowed and will receive multiple transfers
    function batchSendTokenDifferentAmounts(
        address token,
        address[] calldata recipients,
        externalEuint64[] calldata amounts,
        bytes calldata inputProof
    ) external nonReentrant {
        if (token == address(0)) revert ZeroAddress();

        uint256 n = recipients.length;
        if (n == 0) revert RequireOneRecipient();
        if (n != amounts.length) revert ArrayLengthMismatch();
        if (n > MAX_BATCH_SIZE) revert BatchSizeExceeded();

        euint64 eTotal = FHE.asEuint64(0);
        IConfidentialFungibleToken tokenContract = IConfidentialFungibleToken(token);

        for (uint16 i = 0; i < n; ) {
            address to = recipients[i];
            if (to == address(0)) revert ZeroAddress();

            euint64 eAmount = FHE.fromExternal(amounts[i], inputProof);
            tokenContract.confidentialTransferFrom(msg.sender, to, eAmount);

            // Accumulate total
            eTotal = FHE.add(eTotal, eAmount);
            unchecked { ++i; }
        }
        emit BatchTokenTransfer(msg.sender, token, eTotal, n);
    }

    /// @notice Rescues tokens accidentally sent to the contract
    function tokenRescue(
        address token,
        address to,
        externalEuint64 amount,
        bytes calldata inputProof
    ) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (to == address(0)) revert ZeroAddress();

        euint64 eAmount = FHE.fromExternal(amount, inputProof);
        FHE.allowThis(eAmount);
        FHE.allow(eAmount, msg.sender);

        IConfidentialFungibleToken tokenContract = IConfidentialFungibleToken(token);
        tokenContract.confidentialTransfer(to, eAmount);

        emit TokenRescued(token, to, eAmount);
    }

    /// @notice Changes MAX_BATCH_SIZE
    function changeMaxBatchSize(uint16 size) external onlyOwner{
        if (size < 10) revert MinimumSizeIsTen();
        if (size > 100) revert MaximumSizeExceeded();
        MAX_BATCH_SIZE = size;

        emit NewMaxBatchSize(size);
    }
}