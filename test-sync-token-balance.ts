import { ContractService } from './src/contract/contract.service';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testGetSyncTokenBalance() {
  try {
    const contractService = new ContractService();
    
    // Replace with the address you want to check
    const addressToCheck = process.argv[2];
    
    //   0x5bb70d7f0edc9d3fabf44c6168aac14a55ef5cf319acd1807c3e39d9ef05ac6
    if (!addressToCheck) {
      console.error('Please provide a Starknet address as an argument');
      console.log('Usage: npx ts-node test-sync-token-balance.ts <starknet-address>');
      process.exit(1);
    }

    console.log(`Checking SYNC token balance for address: ${addressToCheck}`);
    const balance = await contractService.getSyncTokenBalance(addressToCheck);
    
    console.log('Balance:', balance);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testGetSyncTokenBalance();
