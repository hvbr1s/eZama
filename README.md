# Zama Token - eBatcher7984

This repository contains the eBatcher7984 smart contract for batching confidential token transfers using Zama's FHE technology.

## Contract Information

- **Contract Name**: eBatcher7984
- **Network**: Ethereum Sepolia
- **Deployed Address**: `0x6c2C8A3Bd837f8F0c3286885ea17c17392af91df`
- **Owner Address**: `0x83c1C2a52d56dFb958C52831a3D683cFAfC34c75`
- **Etherscan**: https://sepolia.etherscan.io/address/0x6c2c8a3bd837f8f0c3286885ea17c17392af91df

## Deployment

The contract is deployed using Hardhat with the Fordefi Web3 provider. See [deploy/deploy.ts](deploy/deploy.ts) for the deployment script.

### Deploy Command

```bash
npx hardhat run deploy/deploy.ts --network sepolia
```

## Verification

The contract uses specific compiler settings that must be matched for successful verification:

- **Solidity Version**: 0.8.27
- **Optimizer**: Enabled with 10000 runs
- **EVM Version**: prague
- **Constructor Argument**: `0x83c1C2a52d56dFb958C52831a3D683cFAfC34c75` (owner address)

### Verify with Foundry

```bash
forge verify-contract \
  0x6c2C8A3Bd837f8F0c3286885ea17c17392af91df \
  contracts/eBatcher7984.sol:eBatcher7984 \
  --chain sepolia \
  --compiler-version 0.8.27 \
  --constructor-args $(cast abi-encode "constructor(address)" "0x83c1C2a52d56dFb958C52831a3D683cFAfC34c75") \
  --optimizer-runs 10000 \
  --evm-version prague \
  --watch
```

### Verify with Hardhat

```bash
npx hardhat verify --network sepolia \
  0x6c2C8A3Bd837f8F0c3286885ea17c17392af91df \
  "0x83c1C2a52d56dFb958C52831a3D683cFAfC34c75"
```

Note: The Hardhat verification automatically uses the settings from [hardhat.config.ts](hardhat.config.ts).

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```bash
FORDEFI_API_USER_MACBOOK_PRO_BOT=your_fordefi_api_token
FORDEFI_EVM_VAULT_ADDRESS=your_vault_address
ETHERSCAN_API_KEY=your_etherscan_api_key
```

### Hardhat Configuration

The contract compilation settings are defined in [hardhat.config.ts](hardhat.config.ts):

```typescript
solidity: {
  version: "0.8.27",
  settings: {
    optimizer: {
      enabled: true,
      runs: 10000,
    },
    evmVersion: "prague",
  },
}
```

## Contract Features

The eBatcher7984 contract provides the following functionality:

- **batchSendTokenSameAmount**: Send the same encrypted token amount to multiple recipients
- **batchSendTokenDifferentAmounts**: Send different encrypted token amounts to multiple recipients
- **tokenRescue**: Owner-only function to rescue tokens accidentally sent to the contract
- **changeMaxBatchSize**: Owner-only function to modify the maximum batch size (between 2 and 10)

## Security

- Uses OpenZeppelin's ReentrancyGuard and Ownable contracts
- Implements Zama's FHE (Fully Homomorphic Encryption) for confidential transfers
- Complies with ERC-7984 standard for confidential token transfers
