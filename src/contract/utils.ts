import {
  Abi,
  Account,
  Contract,
  ec,
  num,
  RPC,
  RpcProvider,
  stark,
} from 'starknet';
import { promises as fs } from 'fs';

export function connectToStarknet() {
  return new RpcProvider({
    nodeUrl: process.env.STARKNET_NODE_URL,
  });
}

export function getDeployerWallet() {
  const provider = connectToStarknet();
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY || '';
  const address = process.env.DEPLOYER_ADDRESS || '';
  return new Account(provider, address, privateKey);
}

export function createKeyPair() {
  const privateKey = stark.randomAddress();
  const publicKey = ec.starkCurve.getStarkKey(privateKey);
  return {
    privateKey,
    publicKey,
  };
}

export async function deployAccount() {
  const provider = connectToStarknet();
  const account = getDeployerWallet();
  const accountFactoryAddress = process.env.ACCOUNT_FACTORY_ADDRESS || '';
  const { publicKey } = createKeyPair();
  const userUniqueId = process.env.USER_UNIQUE_ID || 'default_user_id';
  const maxQtyGasAuthorized = '2000';
  const maxPriceAuthorizeForOneGas = '146814825511407';

  const accountFactoryClass = await getClassAt(accountFactoryAddress);

  await writeAbiToFile(accountFactoryClass, 'accountFactoryAbi');

  const call = {
    contractAddress: accountFactoryAddress,
    entrypoint: 'create_account',
    calldata: [publicKey, userUniqueId],
  };

  try {
    const { transaction_hash: txH } = await account.execute(call, {
      version: 3,
      maxFee: 10 ** 15,
      feeDataAvailabilityMode: RPC.EDataAvailabilityMode.L1,
      tip: 10 ** 13,
      paymasterData: [],
      resourceBounds: {
        l1_gas: {
          max_amount: num.toHex(maxQtyGasAuthorized),
          max_price_per_unit: num.toHex(maxPriceAuthorizeForOneGas),
        },
        l2_gas: {
          max_amount: num.toHex(0),
          max_price_per_unit: num.toHex(0),
        },
      },
    });

    const txR = await provider.waitForTransaction(txH);
    if (txR.isSuccess()) {
      console.log('Paid fee =', txR.actual_fee);
    }
  } catch (error) {
    console.error('Error during account creation:', error);
    throw error;
  }
}

export async function getClassAt(contractAddress: string) {
  const provider = connectToStarknet();
  return await provider.getClassAt(contractAddress);
}

export async function writeAbiToFile(classHash: any, fileName: string) {
  if (!classHash.abi) throw new Error('No ABI found for liquidity contract');

  await fs.mkdir('./abi', { recursive: true });

  await fs.writeFile(
    `src/contract/abi/${fileName}.json`,
    JSON.stringify(classHash.abi, undefined, 2),
  );
}

export function createNewContractInstance(abi: Abi, address: string) {
  const provider = connectToStarknet();
  return new Contract(abi, address, provider);
}
