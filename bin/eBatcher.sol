// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { FHE, euint64, externalEuint64, euint8, eaddress, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { IConfidentialFungibleToken } from "@openzeppelin/confidential-contracts/interfaces/IConfidentialFungibleToken.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract eBatcher is ReentrancyGuard, Ownable, SepoliaConfig {
    uint16 public MAX_BATCH_SIZE = 50;
    
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
    ) external nonReentrant returns (bool) {
        if (token == address(0)) revert ZeroAddress();

        uint256 n = recipients.length;
        if (n == 0) revert RequireOneRecipient();
        if (n > MAX_BATCH_SIZE) revert BatchSizeExceeded();

        euint64 eAmountPerRecipient = FHE.fromExternal(amountPerRecipient, inputProof);
        require(FHE.isInitialized(eAmountPerRecipient), "eAmountPerRecipient not initialized!");
        FHE.allowThis(eAmountPerRecipient);
        FHE.allow(eAmountPerRecipient, msg.sender);

        IConfidentialFungibleToken tokenContract = IConfidentialFungibleToken(token);
        for (uint16 i = 0; i < n; ) {
            address to = recipients[i];
            require(to != address(0), "Recipient cannot be 0 address");
            tokenContract.confidentialTransferFrom(msg.sender, to, eAmountPerRecipient);
            unchecked { ++i; }
        }

        return true;
    }

    /// @notice Send DIFFERENT token amounts to many recipients
    /// @dev Duplicate recipients are allowed and will receive multiple transfers
    function batchSendTokenDifferentAmounts(
        address token,
        address[] calldata recipients,
        externalEuint64[] calldata amounts,
        bytes calldata inputProof
    ) external nonReentrant returns(bool) {
        if (token == address(0)) revert ZeroAddress();
        if(recipients.length != amounts.length) revert ArrayLengthMismatch();

        uint256 n = recipients.length;
        if (n == 0) revert RequireOneRecipient();
        if (n > MAX_BATCH_SIZE) revert BatchSizeExceeded();

        IConfidentialFungibleToken tokenContract = IConfidentialFungibleToken(token);

        for (uint16 i = 0; i < n; ) {
            address to = recipients[i];
            if (to == address(0)) {
                revert ZeroAddress();
            }
            euint64 eAmount = FHE.fromExternal(amounts[i], inputProof);
            require(FHE.isInitialized(eAmount), "eAmount not initialized!");
            FHE.allowThis(eAmount);
            FHE.allow(eAmount, msg.sender);
            tokenContract.confidentialTransferFrom(msg.sender, to, eAmount);
            unchecked { ++i; }
        }
        
        return true;
    }

    /// @notice Rescues tokens accidentally sent to the contract
    function tokenRescue(
        address token,
        address to,
        externalEuint64 amount,
        bytes calldata inputProof
    ) external onlyOwner returns(bool) {
        if (token == address(0)) revert ZeroAddress();
        if (to == address(0)) revert ZeroAddress();

        euint64 eAmount = FHE.fromExternal(amount, inputProof);
        FHE.allowThis(eAmount);
        FHE.allow(eAmount, msg.sender);

        IConfidentialFungibleToken tokenContract = IConfidentialFungibleToken(token);
        tokenContract.confidentialTransfer(to, eAmount);

        return true;
    }

    /// @notice Changes MAX_BATCH_SIZE
    function changeMaxBatchSize(uint16 size) external onlyOwner{
        if (size < 10) revert MinimumSizeIsTen();
        if (size > 100) revert MaximumSizeExceeded();
        MAX_BATCH_SIZE = size;

        emit NewMaxBatchSize(size);
    }
}