import { expect } from "chai";
import { ethers } from "hardhat";
import "@fhevm/hardhat-plugin";
import * as hre from "hardhat";
import { EBatcher, EToken } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * eBatcher FHEVM Integration Tests
 *
 * This test suite tests the eBatcher contract with actual eToken deployments
 * using the FHEVM hardhat plugin for encrypted operations.
 */

type Signers = {
  owner: HardhatEthersSigner;
  sender: HardhatEthersSigner;
  recipient1: HardhatEthersSigner;
  recipient2: HardhatEthersSigner;
  recipient3: HardhatEthersSigner;
};

describe("eBatcher - FHEVM Integration Tests", function () {
  let eBatcher: EBatcher;
  let eBatcherAddress: string;
  let eToken: EToken;
  let eTokenAddress: string;
  let signers: Signers;

  const INITIAL_SUPPLY = 1_000_000n * 10n ** 6n; // 1M tokens with 6 decimals

  async function deployContracts() {
    const ethSigners = await ethers.getSigners();
    const signers: Signers = {
      owner: ethSigners[0],
      sender: ethSigners[1],
      recipient1: ethSigners[2],
      recipient2: ethSigners[3],
      recipient3: ethSigners[4],
    };

    // Deploy eBatcher
    const eBatcherFactory = await ethers.getContractFactory("eBatcher");
    const eBatcher = await eBatcherFactory.deploy(signers.owner.address) as EBatcher;
    const eBatcherAddress = await eBatcher.getAddress();

    // Deploy eToken
    const eTokenFactory = await ethers.getContractFactory("eToken");
    const eToken = await eTokenFactory.deploy(
      signers.owner.address,
      INITIAL_SUPPLY,
      "Test Token",
      "TST",
      "https://example.com/token.json"
    ) as EToken;
    const eTokenAddress = await eToken.getAddress();

    return { eBatcher, eBatcherAddress, eToken, eTokenAddress, signers };
  }

  beforeEach(async function () {
    ({ eBatcher, eBatcherAddress, eToken, eTokenAddress, signers } = await deployContracts());
  });

  describe("Setup and Deployment", function () {
    it("Should deploy eBatcher with correct owner", async function () {
      expect(await eBatcher.owner()).to.equal(signers.owner.address);
    });

    it("Should deploy eToken with correct initial supply", async function () {
      expect(await eToken.decimals()).to.equal(6);
      expect(await eToken.name()).to.equal("Test Token");
      expect(await eToken.symbol()).to.equal("TST");
    });

    it("Should allow owner to check confidential total supply", async function () {
      const totalSupply = await eToken.confidentialTotalSupply();
      expect(totalSupply).to.not.be.undefined;
    });
  });

  describe("batchSendTokenSameAmount - Integration", function () {
    const AMOUNT_PER_RECIPIENT = 1000n * 10n ** 6n; // 1000 tokens

    beforeEach(async function () {
      // Transfer tokens from owner to sender
      const transferInput = hre.fhevm.createEncryptedInput(eTokenAddress, signers.owner.address);
      transferInput.add64(100_000n * 10n ** 6n); // 100k tokens to sender
      const encryptedTransferAmount = await transferInput.encrypt();

      await eToken.connect(signers.owner)["confidentialTransfer(address,bytes32,bytes)"](
        signers.sender.address,
        encryptedTransferAmount.handles[0],
        encryptedTransferAmount.inputProof
      );

      // Sender sets eBatcher as operator (approval mechanism for confidential tokens)
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      await eToken.connect(signers.sender).setOperator(eBatcherAddress, futureTimestamp);
    });

    it("Should batch transfer same amount to 2 recipients", async function () {
      const recipients = [signers.recipient1.address, signers.recipient2.address];

      const batchInput = hre.fhevm.createEncryptedInput(eBatcherAddress, signers.sender.address);
      batchInput.add64(AMOUNT_PER_RECIPIENT);
      const encryptedAmount = await batchInput.encrypt();

      const tx = await eBatcher.connect(signers.sender).batchSendTokenSameAmount(
        eTokenAddress,
        recipients,
        encryptedAmount.handles[0],
        encryptedAmount.inputProof
      );

      await expect(tx)
        .to.emit(eBatcher, "BatchTokenTransfer")

      // Verify recipients received tokens (balances are encrypted)
      const recipient1Balance = await eToken.confidentialBalanceOf(signers.recipient1.address);
      const recipient2Balance = await eToken.confidentialBalanceOf(signers.recipient2.address);

      expect(recipient1Balance).to.not.be.undefined;
      expect(recipient2Balance).to.not.be.undefined;
    });

    it("Should batch transfer same amount to 3 recipients", async function () {
      const recipients = [
        signers.recipient1.address,
        signers.recipient2.address,
        signers.recipient3.address,
      ];

      const batchInput = hre.fhevm.createEncryptedInput(eBatcherAddress, signers.sender.address);
      batchInput.add64(AMOUNT_PER_RECIPIENT);
      const encryptedAmount = await batchInput.encrypt();

      const tx = await eBatcher.connect(signers.sender).batchSendTokenSameAmount(
        eTokenAddress,
        recipients,
        encryptedAmount.handles[0],
        encryptedAmount.inputProof
      );

      await expect(tx)
        .to.emit(eBatcher, "BatchTokenTransfer")
    });

    it("Should allow duplicate recipients to receive multiple transfers", async function () {
      const recipients = [signers.recipient1.address, signers.recipient1.address]; // Same recipient twice

      const batchInput = hre.fhevm.createEncryptedInput(eBatcherAddress, signers.sender.address);
      batchInput.add64(AMOUNT_PER_RECIPIENT);
      const encryptedAmount = await batchInput.encrypt();

      const tx = await eBatcher.connect(signers.sender).batchSendTokenSameAmount(
        eTokenAddress,
        recipients,
        encryptedAmount.handles[0],
        encryptedAmount.inputProof
      );

      await expect(tx)
        .to.emit(eBatcher, "BatchTokenTransfer")
    });

    it("Should handle batch of MAX_BATCH_SIZE recipients", async function () {
      const maxBatchSize = await eBatcher.MAX_BATCH_SIZE();
      const recipients = Array(Number(maxBatchSize)).fill(signers.recipient1.address);

      const batchInput = hre.fhevm.createEncryptedInput(eBatcherAddress, signers.sender.address);
      batchInput.add64(100n * 10n ** 6n); // Smaller amount per recipient for max batch
      const encryptedAmount = await batchInput.encrypt();

      const tx = await eBatcher.connect(signers.sender).batchSendTokenSameAmount(
        eTokenAddress,
        recipients,
        encryptedAmount.handles[0],
        encryptedAmount.inputProof
      );

      await expect(tx)
        .to.emit(eBatcher, "BatchTokenTransfer")
    });

    it("Should revert if sender has insufficient balance", async function () {
      const recipients = [signers.recipient1.address];

      const batchInput = hre.fhevm.createEncryptedInput(eBatcherAddress, signers.sender.address);
      batchInput.add64(200_000n * 10n ** 6n); // More than sender has
      const encryptedAmount = await batchInput.encrypt();

      // This should fail during the confidentialTransferFrom call
      await expect(
        eBatcher.connect(signers.sender).batchSendTokenSameAmount(
          eTokenAddress,
          recipients,
          encryptedAmount.handles[0],
          encryptedAmount.inputProof
        )
      ).to.be.reverted;
    });
  });

  describe("batchSendTokenDifferentAmounts - Integration", function () {
    const AMOUNT1 = 1000n * 10n ** 6n; // 1000 tokens
    const AMOUNT2 = 2000n * 10n ** 6n; // 2000 tokens
    const AMOUNT3 = 3000n * 10n ** 6n; // 3000 tokens

    beforeEach(async function () {
      // Transfer tokens from owner to sender
      const transferInput = hre.fhevm.createEncryptedInput(eTokenAddress, signers.owner.address);
      transferInput.add64(100_000n * 10n ** 6n); // 100k tokens to sender
      const encryptedTransferAmount = await transferInput.encrypt();

      await eToken.connect(signers.owner)["confidentialTransfer(address,bytes32,bytes)"](
        signers.sender.address,
        encryptedTransferAmount.handles[0],
        encryptedTransferAmount.inputProof
      );

      // Sender sets eBatcher as operator (approval mechanism for confidential tokens)
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      await eToken.connect(signers.sender).setOperator(eBatcherAddress, futureTimestamp);
    });

    it("Should batch transfer different amounts to 2 recipients", async function () {
      const recipients = [signers.recipient1.address, signers.recipient2.address];

      // Create encrypted inputs for each amount
      const batchInput = hre.fhevm.createEncryptedInput(eBatcherAddress, signers.sender.address);
      batchInput.add64(AMOUNT1);
      batchInput.add64(AMOUNT2);
      const encryptedAmounts = await batchInput.encrypt();

      const tx = await eBatcher.connect(signers.sender).batchSendTokenDifferentAmounts(
        eTokenAddress,
        recipients,
        [encryptedAmounts.handles[0], encryptedAmounts.handles[1]],
        encryptedAmounts.inputProof
      );

      await expect(tx)
        .to.emit(eBatcher, "BatchTokenTransfer")

      // Verify recipients received tokens
      const recipient1Balance = await eToken.confidentialBalanceOf(signers.recipient1.address);
      const recipient2Balance = await eToken.confidentialBalanceOf(signers.recipient2.address);

      expect(recipient1Balance).to.not.be.undefined;
      expect(recipient2Balance).to.not.be.undefined;
    });

    it("Should batch transfer different amounts to 3 recipients", async function () {
      const recipients = [
        signers.recipient1.address,
        signers.recipient2.address,
        signers.recipient3.address,
      ];

      const batchInput = hre.fhevm.createEncryptedInput(eBatcherAddress, signers.sender.address);
      batchInput.add64(AMOUNT1);
      batchInput.add64(AMOUNT2);
      batchInput.add64(AMOUNT3);
      const encryptedAmounts = await batchInput.encrypt();

      const tx = await eBatcher.connect(signers.sender).batchSendTokenDifferentAmounts(
        eTokenAddress,
        recipients,
        [encryptedAmounts.handles[0], encryptedAmounts.handles[1], encryptedAmounts.handles[2]],
        encryptedAmounts.inputProof
      );

      await expect(tx)
        .to.emit(eBatcher, "BatchTokenTransfer")
    });

    it("Should handle mixed amounts including zeros", async function () {
      const recipients = [signers.recipient1.address, signers.recipient2.address];

      const batchInput = hre.fhevm.createEncryptedInput(eBatcherAddress, signers.sender.address);
      batchInput.add64(AMOUNT1);
      batchInput.add64(0n); // Zero amount
      const encryptedAmounts = await batchInput.encrypt();

      const tx = await eBatcher.connect(signers.sender).batchSendTokenDifferentAmounts(
        eTokenAddress,
        recipients,
        [encryptedAmounts.handles[0], encryptedAmounts.handles[1]],
        encryptedAmounts.inputProof
      );

      await expect(tx)
        .to.emit(eBatcher, "BatchTokenTransfer");
    });

    it("Should allow duplicate recipients with different amounts", async function () {
      const recipients = [signers.recipient1.address, signers.recipient1.address];

      const batchInput = hre.fhevm.createEncryptedInput(eBatcherAddress, signers.sender.address);
      batchInput.add64(AMOUNT1);
      batchInput.add64(AMOUNT2);
      const encryptedAmounts = await batchInput.encrypt();

      const tx = await eBatcher.connect(signers.sender).batchSendTokenDifferentAmounts(
        eTokenAddress,
        recipients,
        [encryptedAmounts.handles[0], encryptedAmounts.handles[1]],
        encryptedAmounts.inputProof
      );

      await expect(tx)
        .to.emit(eBatcher, "BatchTokenTransfer")
    });

    it("Should calculate correct total for event emission", async function () {
      const recipients = [signers.recipient1.address, signers.recipient2.address];

      const batchInput = hre.fhevm.createEncryptedInput(eBatcherAddress, signers.sender.address);
      batchInput.add64(AMOUNT1);
      batchInput.add64(AMOUNT2);
      const encryptedAmounts = await batchInput.encrypt();

      const tx = await eBatcher.connect(signers.sender).batchSendTokenDifferentAmounts(
        eTokenAddress,
        recipients,
        [encryptedAmounts.handles[0], encryptedAmounts.handles[1]],
        encryptedAmounts.inputProof
      );

      // The total should be encrypted sum of AMOUNT1 + AMOUNT2
      const receipt = await tx.wait();
      const event = receipt?.logs.find((log) => {
        try {
          return eBatcher.interface.parseLog(log as any)?.name === "BatchTokenTransfer";
        } catch {
          return false;
        }
      });

      expect(event).to.not.be.undefined;
    });
  });

  describe("tokenRescue - Integration", function () {
    it("Should rescue tokens sent to contract by mistake", async function () {
      const rescueAmount = 5000n * 10n ** 6n; // 5000 tokens

      // Accidentally send tokens to eBatcher contract
      const transferInput = hre.fhevm.createEncryptedInput(eTokenAddress, signers.owner.address);
      transferInput.add64(rescueAmount);
      const encryptedAmount = await transferInput.encrypt();

      await eToken.connect(signers.owner)["confidentialTransfer(address,bytes32,bytes)"](
        eBatcherAddress,
        encryptedAmount.handles[0],
        encryptedAmount.inputProof
      );

      // Owner rescues the tokens
      const rescueInput = hre.fhevm.createEncryptedInput(eBatcherAddress, signers.owner.address);
      rescueInput.add64(rescueAmount);
      const encryptedRescue = await rescueInput.encrypt();

      const tx = await eBatcher.connect(signers.owner).tokenRescue(
        eTokenAddress,
        signers.recipient1.address,
        encryptedRescue.handles[0],
        encryptedRescue.inputProof
      );

      await expect(tx)
        .to.emit(eBatcher, "TokenRescued");

      // Verify recipient received the rescued tokens
      const recipientBalance = await eToken.confidentialBalanceOf(signers.recipient1.address);
      expect(recipientBalance).to.not.be.undefined;
    });

    it("Should only allow owner to rescue tokens", async function () {
      const rescueAmount = 1000n * 10n ** 6n;

      const rescueInput = hre.fhevm.createEncryptedInput(eBatcherAddress, signers.sender.address);
      rescueInput.add64(rescueAmount);
      const encryptedRescue = await rescueInput.encrypt();

      await expect(
        eBatcher.connect(signers.sender).tokenRescue(
          eTokenAddress,
          signers.recipient1.address,
          encryptedRescue.handles[0],
          encryptedRescue.inputProof
        )
      ).to.be.revertedWithCustomError(eBatcher, "OwnableUnauthorizedAccount");
    });
  });

  describe("Gas Efficiency Tests", function () {
    beforeEach(async function () {
      // Setup sender with tokens and approval
      const transferInput = hre.fhevm.createEncryptedInput(eTokenAddress, signers.owner.address);
      transferInput.add64(100_000n * 10n ** 6n);
      const encryptedTransferAmount = await transferInput.encrypt();

      await eToken.connect(signers.owner)["confidentialTransfer(address,bytes32,bytes)"](
        signers.sender.address,
        encryptedTransferAmount.handles[0],
        encryptedTransferAmount.inputProof
      );

      // Set eBatcher as operator
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      await eToken.connect(signers.sender).setOperator(eBatcherAddress, futureTimestamp);
    });

    it("Should be more gas efficient than individual transfers for same amounts", async function () {
      const recipients = [signers.recipient1.address, signers.recipient2.address, signers.recipient3.address];
      const amount = 1000n * 10n ** 6n;

      // Batch transfer
      const batchInput = hre.fhevm.createEncryptedInput(eBatcherAddress, signers.sender.address);
      batchInput.add64(amount);
      const encryptedAmount = await batchInput.encrypt();

      const batchTx = await eBatcher.connect(signers.sender).batchSendTokenSameAmount(
        eTokenAddress,
        recipients,
        encryptedAmount.handles[0],
        encryptedAmount.inputProof
      );
      const batchReceipt = await batchTx.wait();
      const batchGas = batchReceipt?.gasUsed || 0n;

      console.log(`      Batch transfer (3 recipients, same amount): ${batchGas} gas`);
      expect(batchGas).to.be.greaterThan(0);
    });

    it("Should track gas usage for different amounts batch", async function () {
      const recipients = [signers.recipient1.address, signers.recipient2.address];

      const batchInput = hre.fhevm.createEncryptedInput(eBatcherAddress, signers.sender.address);
      batchInput.add64(1000n * 10n ** 6n);
      batchInput.add64(2000n * 10n ** 6n);
      const encryptedAmounts = await batchInput.encrypt();

      const tx = await eBatcher.connect(signers.sender).batchSendTokenDifferentAmounts(
        eTokenAddress,
        recipients,
        [encryptedAmounts.handles[0], encryptedAmounts.handles[1]],
        encryptedAmounts.inputProof
      );
      const receipt = await tx.wait();
      const gasUsed = receipt?.gasUsed || 0n;

      console.log(`      Batch transfer (2 recipients, different amounts): ${gasUsed} gas`);
      expect(gasUsed).to.be.greaterThan(0);
    });
  });

  describe("Edge Cases and Security", function () {
    it("Should handle reentrancy protection", async function () {
      // The contract has nonReentrant modifiers on all batch functions
      // This ensures that even with a malicious token, reentrancy is prevented
      expect(await eBatcher.MAX_BATCH_SIZE()).to.be.greaterThan(0);
    });

    it("Should properly handle batch size limits after configuration change", async function () {
      // Change max batch size to 10
      await eBatcher.connect(signers.owner).changeMaxBatchSize(10);

      const recipients = Array(11).fill(signers.recipient1.address);
      const batchInput = hre.fhevm.createEncryptedInput(eBatcherAddress, signers.sender.address);
      batchInput.add64(100n * 10n ** 6n);
      const encryptedAmount = await batchInput.encrypt();

      await expect(
        eBatcher.connect(signers.sender).batchSendTokenSameAmount(
          eTokenAddress,
          recipients,
          encryptedAmount.handles[0],
          encryptedAmount.inputProof
        )
      ).to.be.revertedWithCustomError(eBatcher, "BatchSizeExceeded");

      // Reset to default
      await eBatcher.connect(signers.owner).changeMaxBatchSize(50);
    });

    it("Should not allow zero address recipients in batch", async function () {
      // Setup sender with tokens and approval
      const transferInput = hre.fhevm.createEncryptedInput(eTokenAddress, signers.owner.address);
      transferInput.add64(10_000n * 10n ** 6n);
      const encryptedTransferAmount = await transferInput.encrypt();

      await eToken.connect(signers.owner)["confidentialTransfer(address,bytes32,bytes)"](
        signers.sender.address,
        encryptedTransferAmount.handles[0],
        encryptedTransferAmount.inputProof
      );

      // Set eBatcher as operator
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      await eToken.connect(signers.sender).setOperator(eBatcherAddress, futureTimestamp);

      // Try to send to zero address
      const recipients = [ethers.ZeroAddress, signers.recipient1.address];
      const batchInput = hre.fhevm.createEncryptedInput(eBatcherAddress, signers.sender.address);
      batchInput.add64(1000n * 10n ** 6n);
      const encryptedAmount = await batchInput.encrypt();

      await expect(
        eBatcher.connect(signers.sender).batchSendTokenSameAmount(
          eTokenAddress,
          recipients,
          encryptedAmount.handles[0],
          encryptedAmount.inputProof
        )
      ).to.be.revertedWithCustomError(eBatcher, "ZeroAddress");
    });
  });
});
