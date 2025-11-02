// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { FHE, euint64, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { IERC7984 } from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract eBatcher7984Upgradeable is 
    Initializable, 
    UUPSUpgradeable, 
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable, 
    SepoliaConfig 
{
    uint16 public MAX_BATCH_SIZE = 20;
    
    event NewMaxBatchSize(uint16 size);
    event TokenRescued(address indexed token, address recipient);
    event BatchTokenTransfer(address indexed, address[] recipients);

    error InsufficientTokenAllowance();
    error InsufficientTokenBalance();
    error ArrayLengthMismatch();
    error BatchSizeExceeded();
    error ZeroAddress();
    error NoTokenToRescue();
    error ETHSendFailed();
    error RequireOneRecipient();
    error NotEnoughETH();
    error MinimumSizeIsTwo();
    error MaximumSizeIsFifty();
    error BatchFailed();

    function initialize(address owner_) public initializer {
        __Ownable_init(owner_);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        
        MAX_BATCH_SIZE = 20;
    }

     /// @notice Only owner can upgrade
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

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

        uint256 n = recipients.length;

        if (token == address(0)) revert ZeroAddress();
        if (n == 0) revert RequireOneRecipient();
        if (n > MAX_BATCH_SIZE) revert BatchSizeExceeded();

        euint64 eAmountPerRecipient = FHE.fromExternal(amountPerRecipient, inputProof);
        require(FHE.isInitialized(eAmountPerRecipient), "eAmountPerRecipient not initialized!");

        FHE.allow(eAmountPerRecipient, token);

        for (uint16 i = 0; i < n; ) {
            address to = recipients[i];
            if (to == address(0)) revert ZeroAddress();
            IERC7984(token).confidentialTransferFrom(msg.sender, to, eAmountPerRecipient);
            unchecked { ++i; }
        }

        emit BatchTokenTransfer(msg.sender, recipients);

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

        uint256 n = recipients.length;

        if (token == address(0)) revert ZeroAddress();
        if(recipients.length != amounts.length) revert ArrayLengthMismatch();
        if (n == 0) revert RequireOneRecipient();
        if (n > MAX_BATCH_SIZE) revert BatchSizeExceeded();

        for (uint16 i = 0; i < n; ) {
            address to = recipients[i];
            if (to == address(0))revert ZeroAddress();
            euint64 eAmount = FHE.fromExternal(amounts[i], inputProof);
            require(FHE.isInitialized(eAmount), "eAmount not initialized!");
            FHE.allow(eAmount, token);
            IERC7984(token).confidentialTransferFrom(msg.sender, to, eAmount);

            unchecked { ++i; }
        }

        emit BatchTokenTransfer(msg.sender, recipients);
        
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
        FHE.allow(eAmount, token);

        IERC7984(token).confidentialTransfer(to, eAmount);

        emit TokenRescued(token, to);

        return true;
    }

    /// @notice Changes MAX_BATCH_SIZE
    function changeMaxBatchSize(uint16 size) external onlyOwner{
        if (size < 2) revert MinimumSizeIsTwo();
        if (size > 50) revert MaximumSizeIsFifty();
        MAX_BATCH_SIZE = size;

        emit NewMaxBatchSize(size);
    }

    /// @notice Returns the current version of the contract
    function version() public pure returns (string memory){
        return "0.1.0";
    }
}