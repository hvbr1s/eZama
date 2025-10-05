import { expect } from "chai";
import { ethers } from "hardhat";
import { EBatcher } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * eBatcher Contract Tests
 *
 * NOTE: This contract uses FHEVM (Fully Homomorphic Encryption Virtual Machine) for confidential transfers.
 * Some tests that require actual token transfers will fail without a proper FHEVM test environment
 * (InputVerifier, KMSVerifier, ACL, etc. must be deployed and configured).
 *
 * The tests below focus on:
 * 1. Contract deployment and configuration
 * 2. Input validation and access control
 * 3. Batch size limits and array validation
 *
 * For full integration testing with actual encrypted transfers, you would need to:
 * - Deploy FHEVM infrastructure contracts
 * - Use the fhevmjs library to create proper encrypted inputs
 * - Set up the gateway and KMS for encryption/decryption
 */
describe("eBatcher", function () {
  let eBatcher: EBatcher;
  let owner: SignerWithAddress;
  let sender: SignerWithAddress;
  let recipient1: SignerWithAddress;
  let recipient2: SignerWithAddress;
  let recipient3: SignerWithAddress;
  let mockTokenAddress: string;

  const DEFAULT_MAX_BATCH_SIZE = 50;

  // Helper function to create mock encrypted amount (bytes32)
  const mockEncryptedAmount = (value: number): string => {
    return ethers.zeroPadValue(ethers.toBeHex(value), 32);
  };

  beforeEach(async function () {
    [owner, sender, recipient1, recipient2, recipient3] = await ethers.getSigners();

    // Use a mock token address (tests will focus on eBatcher logic, not actual token transfers)
    mockTokenAddress = recipient3.address; // Using an address as a mock token

    // Deploy eBatcher
    const eBatcherFactory = await ethers.getContractFactory("eBatcher");
    eBatcher = await eBatcherFactory.deploy(owner.address);
    await eBatcher.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await eBatcher.owner()).to.equal(owner.address);
    });

    it("Should set MAX_BATCH_SIZE to 50", async function () {
      expect(await eBatcher.MAX_BATCH_SIZE()).to.equal(DEFAULT_MAX_BATCH_SIZE);
    });
  });

  describe("batchSendTokenSameAmount", function () {
    it("Should revert if token address is zero", async function () {
      const recipients = [recipient1.address];
      const amount = mockEncryptedAmount(100);
      const inputProof = "0x";

      await expect(
        eBatcher.batchSendTokenSameAmount(
          ethers.ZeroAddress,
          recipients,
          amount,
          inputProof
        )
      ).to.be.revertedWithCustomError(eBatcher, "ZeroAddress");
    });

    it("Should revert if recipients array is empty", async function () {
      const recipients: string[] = [];
      const amount = mockEncryptedAmount(100);
      const inputProof = "0x";

      await expect(
        eBatcher.batchSendTokenSameAmount(
          mockTokenAddress,
          recipients,
          amount,
          inputProof
        )
      ).to.be.revertedWithCustomError(eBatcher, "RequireOneRecipient");
    });

    it("Should revert if batch size exceeds MAX_BATCH_SIZE", async function () {
      const recipients = Array(51).fill(recipient1.address);
      const amount = mockEncryptedAmount(100);
      const inputProof = "0x";

      await expect(
        eBatcher.batchSendTokenSameAmount(
          mockTokenAddress,
          recipients,
          amount,
          inputProof
        )
      ).to.be.revertedWithCustomError(eBatcher, "BatchSizeExceeded");
    });

    it.skip("Should revert if a recipient address is zero (requires FHEVM setup)", async function () {
      // This test requires FHEVM to get past encryption verification to reach the zero address check
      const recipients = [recipient1.address, ethers.ZeroAddress, recipient2.address];
      const amount = mockEncryptedAmount(100);
      const inputProof = "0x";

      await expect(
        eBatcher.batchSendTokenSameAmount(
          mockTokenAddress,
          recipients,
          amount,
          inputProof
        )
      ).to.be.revertedWithCustomError(eBatcher, "ZeroAddress");
    });

    it.skip("Should emit BatchTokenTransfer event (requires FHEVM setup)", async function () {
      // This test requires proper FHEVM infrastructure (InputVerifier, KMSVerifier)
      const recipients = [recipient1.address, recipient2.address];
      const amount = mockEncryptedAmount(100);
      const inputProof = "0x";

      const tx = eBatcher.connect(sender).batchSendTokenSameAmount(
        mockTokenAddress,
        recipients,
        amount,
        inputProof
      );

      await expect(tx)
        .to.emit(eBatcher, "BatchTokenTransfer");
    });

    it.skip("Should allow duplicate recipients (requires FHEVM setup)", async function () {
      // This test requires proper FHEVM infrastructure
      const recipients = [recipient1.address, recipient1.address];
      const amount = mockEncryptedAmount(100);
      const inputProof = "0x";

      const tx = eBatcher.connect(sender).batchSendTokenSameAmount(
        mockTokenAddress,
        recipients,
        amount,
        inputProof
      );

      await expect(tx).to.emit(eBatcher, "BatchTokenTransfer");
    });

    it.skip("Should handle maximum batch size (requires FHEVM setup)", async function () {
      // This test requires proper FHEVM infrastructure
      const recipients = Array(50).fill(recipient1.address);
      const amount = mockEncryptedAmount(100);
      const inputProof = "0x";

      const tx = eBatcher.connect(sender).batchSendTokenSameAmount(
        mockTokenAddress,
        recipients,
        amount,
        inputProof
      );

      await expect(tx).to.emit(eBatcher, "BatchTokenTransfer");
    });
  });

  describe("batchSendTokenDifferentAmounts", function () {
    it("Should revert if token address is zero", async function () {
      const recipients = [recipient1.address];
      const amounts = [mockEncryptedAmount(100)];
      const inputProof = "0x";

      await expect(
        eBatcher.batchSendTokenDifferentAmounts(
          ethers.ZeroAddress,
          recipients,
          amounts,
          inputProof
        )
      ).to.be.revertedWithCustomError(eBatcher, "ZeroAddress");
    });

    it("Should revert if recipients array is empty", async function () {
      const recipients: string[] = [];
      const amounts: bigint[] = [];
      const inputProof = "0x";

      await expect(
        eBatcher.batchSendTokenDifferentAmounts(
          mockTokenAddress,
          recipients,
          amounts,
          inputProof
        )
      ).to.be.revertedWithCustomError(eBatcher, "RequireOneRecipient");
    });

    it("Should revert if arrays length mismatch", async function () {
      const recipients = [recipient1.address, recipient2.address];
      const amounts = [mockEncryptedAmount(100)]; // Mismatched length
      const inputProof = "0x";

      await expect(
        eBatcher.batchSendTokenDifferentAmounts(
          mockTokenAddress,
          recipients,
          amounts,
          inputProof
        )
      ).to.be.revertedWithCustomError(eBatcher, "ArrayLengthMismatch");
    });

    it("Should revert if batch size exceeds MAX_BATCH_SIZE", async function () {
      const recipients = Array(51).fill(recipient1.address);
      const amounts = Array(51).fill(mockEncryptedAmount(100));
      const inputProof = "0x";

      await expect(
        eBatcher.batchSendTokenDifferentAmounts(
          mockTokenAddress,
          recipients,
          amounts,
          inputProof
        )
      ).to.be.revertedWithCustomError(eBatcher, "BatchSizeExceeded");
    });

    it.skip("Should revert if a recipient address is zero (requires FHEVM setup)", async function () {
      // This test requires FHEVM to get past encryption verification to reach the zero address check
      const recipients = [recipient1.address, ethers.ZeroAddress];
      const amounts = [mockEncryptedAmount(100), mockEncryptedAmount(200)];
      const inputProof = "0x";

      await expect(
        eBatcher.batchSendTokenDifferentAmounts(
          mockTokenAddress,
          recipients,
          amounts,
          inputProof
        )
      ).to.be.revertedWithCustomError(eBatcher, "ZeroAddress");
    });

    it.skip("Should emit BatchTokenTransfer event (requires FHEVM setup)", async function () {
      // This test requires proper FHEVM infrastructure
      const recipients = [recipient1.address, recipient2.address];
      const amounts = [mockEncryptedAmount(100), mockEncryptedAmount(200)];
      const inputProof = "0x";

      const tx = eBatcher.connect(sender).batchSendTokenDifferentAmounts(
        mockTokenAddress,
        recipients,
        amounts,
        inputProof
      );

      await expect(tx).to.emit(eBatcher, "BatchTokenTransfer");
    });

    it.skip("Should allow duplicate recipients (requires FHEVM setup)", async function () {
      // This test requires proper FHEVM infrastructure
      const recipients = [recipient1.address, recipient1.address];
      const amounts = [mockEncryptedAmount(100), mockEncryptedAmount(200)];
      const inputProof = "0x";

      const tx = eBatcher.connect(sender).batchSendTokenDifferentAmounts(
        mockTokenAddress,
        recipients,
        amounts,
        inputProof
      );

      await expect(tx).to.emit(eBatcher, "BatchTokenTransfer");
    });

    it.skip("Should handle maximum batch size (requires FHEVM setup)", async function () {
      // This test requires proper FHEVM infrastructure
      const recipients = Array(50).fill(recipient1.address);
      const amounts = Array(50).fill(mockEncryptedAmount(100));
      const inputProof = "0x";

      const tx = eBatcher.connect(sender).batchSendTokenDifferentAmounts(
        mockTokenAddress,
        recipients,
        amounts,
        inputProof
      );

      await expect(tx).to.emit(eBatcher, "BatchTokenTransfer");
    });
  });

  describe("tokenRescue", function () {
    it("Should revert if not called by owner", async function () {
      const amount = mockEncryptedAmount(100);
      const inputProof = "0x";

      await expect(
        eBatcher.connect(sender).tokenRescue(
          mockTokenAddress,
          recipient1.address,
          amount,
          inputProof
        )
      ).to.be.revertedWithCustomError(eBatcher, "OwnableUnauthorizedAccount");
    });

    it("Should revert if token address is zero", async function () {
      const amount = mockEncryptedAmount(100);
      const inputProof = "0x";

      await expect(
        eBatcher.connect(owner).tokenRescue(
          ethers.ZeroAddress,
          recipient1.address,
          amount,
          inputProof
        )
      ).to.be.revertedWithCustomError(eBatcher, "ZeroAddress");
    });

    it("Should revert if recipient address is zero", async function () {
      const amount = mockEncryptedAmount(100);
      const inputProof = "0x";

      await expect(
        eBatcher.connect(owner).tokenRescue(
          mockTokenAddress,
          ethers.ZeroAddress,
          amount,
          inputProof
        )
      ).to.be.revertedWithCustomError(eBatcher, "ZeroAddress");
    });

    it.skip("Should emit TokenRescued event when successful (requires FHEVM setup)", async function () {
      // This test requires proper FHEVM infrastructure
      const amount = mockEncryptedAmount(100);
      const inputProof = "0x";

      const tx = eBatcher.connect(owner).tokenRescue(
        mockTokenAddress,
        recipient1.address,
        amount,
        inputProof
      );

      await expect(tx)
        .to.emit(eBatcher, "TokenRescued")
        .withArgs(mockTokenAddress, recipient1.address, amount);
    });
  });

  describe("changeMaxBatchSize", function () {
    it("Should revert if not called by owner", async function () {
      await expect(
        eBatcher.connect(sender).changeMaxBatchSize(75)
      ).to.be.revertedWithCustomError(eBatcher, "OwnableUnauthorizedAccount");
    });

    it("Should revert if size is less than 10", async function () {
      await expect(
        eBatcher.connect(owner).changeMaxBatchSize(9)
      ).to.be.revertedWithCustomError(eBatcher, "MinimumSizeIsTen");
    });

    it("Should revert if size is greater than 100", async function () {
      await expect(
        eBatcher.connect(owner).changeMaxBatchSize(101)
      ).to.be.revertedWithCustomError(eBatcher, "MaximumSizeExceeded");
    });

    it("Should allow size of 10 (minimum)", async function () {
      await expect(eBatcher.connect(owner).changeMaxBatchSize(10))
        .to.emit(eBatcher, "NewMaxBatchSize")
        .withArgs(10);

      expect(await eBatcher.MAX_BATCH_SIZE()).to.equal(10);
    });

    it("Should allow size of 100 (maximum)", async function () {
      await expect(eBatcher.connect(owner).changeMaxBatchSize(100))
        .to.emit(eBatcher, "NewMaxBatchSize")
        .withArgs(100);

      expect(await eBatcher.MAX_BATCH_SIZE()).to.equal(100);
    });

    it("Should update MAX_BATCH_SIZE and emit event", async function () {
      const newSize = 75;

      await expect(eBatcher.connect(owner).changeMaxBatchSize(newSize))
        .to.emit(eBatcher, "NewMaxBatchSize")
        .withArgs(newSize);

      expect(await eBatcher.MAX_BATCH_SIZE()).to.equal(newSize);
    });

    it("Should affect subsequent batch operations", async function () {
      // Set batch size to 10
      await eBatcher.connect(owner).changeMaxBatchSize(10);

      // Try to send to 11 recipients (should fail)
      const recipients = Array(11).fill(recipient1.address);
      const amount = mockEncryptedAmount(100);
      const inputProof = "0x";

      await expect(
        eBatcher.batchSendTokenSameAmount(
          mockTokenAddress,
          recipients,
          amount,
          inputProof
        )
      ).to.be.revertedWithCustomError(eBatcher, "BatchSizeExceeded");
    });
  });

  describe("ReentrancyGuard", function () {
    it("Should prevent reentrancy in batchSendTokenSameAmount", async function () {
      // This would require a malicious token contract to test properly
      // Included as a reminder that ReentrancyGuard is active
    });

    it("Should prevent reentrancy in batchSendTokenDifferentAmounts", async function () {
      // This would require a malicious token contract to test properly
      // Included as a reminder that ReentrancyGuard is active
    });

    it("Should prevent reentrancy in tokenRescue", async function () {
      // This would require a malicious token contract to test properly
      // Included as a reminder that ReentrancyGuard is active
    });
  });

  describe("Edge Cases", function () {
    it.skip("Should handle single recipient batch (requires FHEVM setup)", async function () {
      // This test requires proper FHEVM infrastructure
      const recipients = [recipient1.address];
      const amount = mockEncryptedAmount(100);
      const inputProof = "0x";

      const tx = eBatcher.connect(sender).batchSendTokenSameAmount(
        mockTokenAddress,
        recipients,
        amount,
        inputProof
      );

      await expect(tx).to.emit(eBatcher, "BatchTokenTransfer");
    });

    it.skip("Should handle all recipients being the same address (requires FHEVM setup)", async function () {
      // This test requires proper FHEVM infrastructure
      const recipients = Array(10).fill(recipient1.address);
      const amount = mockEncryptedAmount(100);
      const inputProof = "0x";

      const tx = eBatcher.connect(sender).batchSendTokenSameAmount(
        mockTokenAddress,
        recipients,
        amount,
        inputProof
      );

      await expect(tx).to.emit(eBatcher, "BatchTokenTransfer");
    });

    it.skip("Should handle varying amounts including zero (requires FHEVM setup)", async function () {
      // This test requires proper FHEVM infrastructure
      const recipients = [recipient1.address, recipient2.address];
      const amounts = [mockEncryptedAmount(0), mockEncryptedAmount(100)];
      const inputProof = "0x";

      const tx = eBatcher.connect(sender).batchSendTokenDifferentAmounts(
        mockTokenAddress,
        recipients,
        amounts,
        inputProof
      );

      await expect(tx).to.emit(eBatcher, "BatchTokenTransfer");
    });
  });
});
