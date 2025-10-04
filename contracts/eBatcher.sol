// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { FHE, euint64, externalEuint64, eaddress, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IConfidentialERC20 {
    function transfer(address to, externalEuint64 encryptedAmount, bytes calldata inputProof) external returns (bool);
    function transfer(address to, euint64 amount) external returns (bool);
    function transferFrom(address from, address to, euint64 amount) external returns (bool);
}

contract BatchTransfer is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    uint16 public MAX_BATCH_SIZE = 200;
    
    event BatchTokenTransfer(address indexed sender, address indexed token, euint64 totalAmount, uint256 recipients);
    event TokenRescued(address indexed token, address indexed owner, euint64 amount);
    event NewMaxBatchSize(uint16 size);

    error ArrayLengthMismatch();
    error BatchSizeExceeded();
    error ZeroAddress();
    error InsufficientTokenAllowance();
    error InsufficientTokenBalance();
    error NoTokenToRescue();
    error ETHSendFailed();
    error RequireOneRecipient();
    error NotEnoughETH();
    error MinimumSizeIsTen();
    error MaximumSizeExceeded();

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
        IConfidentialERC20 tokenContract = IConfidentialERC20(token);

        for (uint16 i = 0; i < n; ) {
            address to = recipients[i];
            if (to == address(0)) revert ZeroAddress();

            tokenContract.transferFrom(msg.sender, to, eAmountPerRecipient);
            unchecked { ++i; }
        }

        // Calculate total for event
        euint64 eTotal = FHE.mul(eAmountPerRecipient, uint64(n));
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

        IConfidentialERC20 tokenContract = IConfidentialERC20(token);
        euint64 eTotal = FHE.asEuint64(0);

        for (uint16 i = 0; i < n; ) {
            address to = recipients[i];
            if (to == address(0)) revert ZeroAddress();

            euint64 eAmount = FHE.fromExternal(amounts[i], inputProof);
            tokenContract.transferFrom(msg.sender, to, eAmount);

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

        IConfidentialERC20(token).transfer(to, amount, inputProof);

        emit TokenRescued(token, to, FHE.fromExternal(amount, inputProof));
    }

    /// @notice Changes MAX_BATCH_SIZE
    function changeMaxBatchSize(uint16 size) external onlyOwner{
        if (size < 10) revert MinimumSizeIsTen();
        if (size > 1000) revert MaximumSizeExceeded();
        MAX_BATCH_SIZE = size;

        emit NewMaxBatchSize(size);
    }
}