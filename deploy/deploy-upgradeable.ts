import fs from 'fs';
import hre from "hardhat";
import dotenv from 'dotenv';
import "@nomicfoundation/hardhat-ethers";
import { getProvider } from "./get-provider";
import { FordefiProviderConfig } from "@fordefi/web3-provider";

dotenv.config()

const { upgrades } = require("hardhat");
const FORDEFI_API_USER_TOKEN = process.env.FORDEFI_API_USER_MACBOOK_PRO_BOT ?? 
(() => { throw new Error('FORDEFI_API_USER_TOKEN is not set') })();
const privateKeyFilePath = './secrets/private2.pem';
const PEM_PRIVATE_KEY = fs.readFileSync(privateKeyFilePath, 'utf8') ??
(() => { throw new Error('PEM_PRIVATE_KEY is not set') })();
const FORDEFI_EVM_VAULT_ADDRESS = process.env.FORDEFI_EVM_VAULT_ADDRESS ?? 
(() => { throw new Error('FORDEFI_EVM_VAULT_ADDRESS is not set') })();

const config: FordefiProviderConfig = {
    address: FORDEFI_EVM_VAULT_ADDRESS as `0x${string}`,
    apiUserToken: FORDEFI_API_USER_TOKEN,
    apiPayloadSignKey: PEM_PRIVATE_KEY,
    chainId: 11155111,
    rpcUrl: "https://ethereum-sepolia.publicnode.com",
};

async function main() {
    let provider = await getProvider(config);
    if (!provider) throw new Error("Failed to initialize provider");
    let web3Provider = new hre.ethers.BrowserProvider(provider); 
  
    const deployer = await web3Provider.getSigner();
    
    const factory = await hre.ethers.getContractFactory("eBatcher7984Upgradeable", deployer);
    console.log('Deploying upgradeable contract...');

    console.log("\nDeploying proxy and implementation...");
    const proxy = await upgrades.deployProxy(
        factory,
        [deployer.address], // initializer arguments: owner address
        { 
        initializer: 'initialize',
        kind: 'uups'
        }
    );

    await proxy.waitForDeployment();
    const proxyAddress = await proxy.getAddress();
    console.log("\n✅ Proxy deployed to:", proxyAddress);

    // Get implementation address
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("📝 Implementation deployed to:", implementationAddress);

    // Verify the deployment
    const maxBatchSize = await proxy.MAX_BATCH_SIZE();
    const owner = await proxy.owner();
    const version = await proxy.version();

    console.log("\n📊 Contract State:");
    console.log("   MAX_BATCH_SIZE:", maxBatchSize.toString());
    console.log("   Owner:", owner);
    console.log("   Version:", version);

    console.log("\n🎉 Deployment complete!");
    console.log("\n⚠️  Save these addresses:");
    console.log("   Proxy:", proxyAddress);
    console.log("   Implementation:", implementationAddress);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });