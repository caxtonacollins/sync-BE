import {
  Abi,
  Account,
  Contract,
  ec,
  num,
  RpcProvider,
  shortString,
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

export async function getClassAt(contractAddress: string) {
  const provider = connectToStarknet();
  return await provider.getClassAt(contractAddress);
}

export async function writeAbiToFile(classHash: any, fileName: string) {
  if (!classHash.abi) throw new Error('No ABI found for liquidity contract');

  const dirExists = await fs
    .access('./abi')
    .then(() => true)
    .catch(() => false);

  if (!dirExists) {
    console.log(`Directory ./abi does not exist. Creating it.`);
    await fs.mkdir('./abi', { recursive: true });
  }
  const fileExists = await fs
    .access(`src/contract/abi/${fileName}.json`)
    .then(() => true)
    .catch(() => false);

  if (!fileExists) {
    console.log(`File ${fileName}.json does not exist. Creating it.`);
    await fs.writeFile(
      `src/contract/abi/${fileName}.json`,
      JSON.stringify(classHash.abi, undefined, 2),
    );
    return;
  }
  const content = await fs.readFile(
    `src/contract/abi/${fileName}.json`,
    'utf-8',
  );

  if (!content) {
    console.log(`No ABI file found for ${fileName}. Creating a new one.`);
    await fs.mkdir('./abi', { recursive: true });

    await fs.writeFile(
      `src/contract/abi/${fileName}.json`,
      JSON.stringify(classHash.abi, undefined, 2),
    );
  }
}

export function createNewContractInstance(abi: Abi, address: string) {
  const provider = connectToStarknet();
  return new Contract(abi, address, provider);
}

export function uuidToFelt252(uuid: string) {
  const feltUuid = uuid.replace(/-/g, '');

  return shortString.encodeShortString(feltUuid.slice(0, 31));
}
