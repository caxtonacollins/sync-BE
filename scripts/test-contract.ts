import { ContractService } from '../src/contract/contract.service';

async function main() {
  // const userAddress = process.argv[2];
  // if (!userAddress) {
  //   console.error(
  //     'Usage: ts-node scripts/check-user-registered.ts <USER_ADDRESS>',
  //   );
  //   process.exit(1);
  // }

  const address =
    '0x0456e6d7184cd79e3f5cc63397a5540e8aeef7fd2f136136dfd40caf122cba88';

  const fiat_account_id = 'usfjsfislfisslf';

  const contractService = new ContractService();
  // const isRegistered = await contractService.checkUserRegistered(userAddress);
  // console.log('isRegistered:', isRegistered);

  // const register_user = await contractService.registerUserTOLiquidity(
  //   address,
  //   fiat_account_id,
  // );
  // console.log('registered user', register_user);

  // const computeAddress = contractService.computeAddress();
  // console.log('computeAddress:', computeAddress);

  await contractService.accountDeployment();

  // await contractService.createAccount('1234567');
}

void main();

// npx ts-node scripts/test-contract.ts 0x0456e6d7184cd79e3f5cc63397a5540e8aeef7fd2f136136dfd40caf122cba88
// npx ts-node scripts/test-contract.ts
