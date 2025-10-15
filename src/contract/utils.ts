import { Abi, Account, Contract, ec, num, RpcProvider, stark } from 'starknet';
import { promises as fs } from 'fs';
import crypto from 'crypto';

export function connectToStarknet() {
  if (!process.env.STARKNET_NODE_URL_8)
    throw new Error('STARKNET_NODE_URL_8 is not defined');
  return new RpcProvider({
    nodeUrl: process.env.STARKNET_NODE_URL_8,
  });
}

export function connectToStarknet7() {
  return new RpcProvider({
    nodeUrl: process.env.STARKNET_NODE_URL_7,
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

export function uuidToFelt252(uuid: string): string {
  // Remove all hyphens and convert to lowercase
  const cleanUuid = uuid.replace(/-/g, '').toLowerCase();

  // Ensure the UUID is 32 characters long
  if (cleanUuid.length !== 32) {
    throw new Error(
      'Invalid UUID format: must be 32 hex characters after removing hyphens',
    );
  }

  // Convert to BigInt and then to hex string
  // This ensures we can handle the full 128-bit UUID
  const bigIntValue = BigInt(`0x${cleanUuid}`);

  // Convert to 0x-prefixed hex string
  return `0x${bigIntValue.toString(16)}`;
}

export function felt252ToUuid(felt: string): string {
  if (!felt) throw new Error('Felt value is required');

  try {
    // Convert decimal string or hex to BigInt
    const bigIntValue = felt.startsWith('0x') ? BigInt(felt) : BigInt(felt);

    // Convert to hex string (without 0x prefix) and pad to 32 characters
    const hexString = num.toHex(bigIntValue).slice(2).padStart(32, '0');

    // Insert hyphens at UUID positions (8-4-4-4-12)
    return `${hexString.slice(0, 8)}-${hexString.slice(8, 12)}-${hexString.slice(
      12,
      16,
    )}-${hexString.slice(16, 20)}-${hexString.slice(20)}`;
  } catch (error) {
    console.error(
      `Error converting felt252 to UUID: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    console.error('Input felt:', felt);
    throw error;
  }
}

// Example usage:
// const uuid = '2b4b6efc-9ec4-40a0-914a-f49cd4e6090d';
// const felt = uuidToFelt252(uuid); // Converts to felt252
// const originalUuid = felt252ToUuid(felt); // Converts back to UUID

export function encryptPrivateKey(privateKey: string): string {
  const algorithm = 'aes-256-gcm';
  const keyLength = 32;
  const ivLength = 16;
  const saltLength = 64;

  const masterKey = process.env.WALLET_ENCRYPTION_KEY;
  if (!masterKey) {
    throw new Error('WALLET_ENCRYPTION_KEY environment variable not set');
  }

  // Generate random salt and IV
  const salt = crypto.randomBytes(saltLength);
  const iv = crypto.randomBytes(ivLength);

  // Derive key from master key using salt
  const key = crypto.scryptSync(masterKey, salt, keyLength);

  // Create cipher
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  // Encrypt
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get auth tag
  const authTag = cipher.getAuthTag();

  // Combine: salt:iv:authTag:encrypted
  return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptPrivateKey(encryptedData: string): string {
  const algorithm = 'aes-256-gcm';
  const keyLength = 32;

  const masterKey = process.env.WALLET_ENCRYPTION_KEY;
  if (!masterKey) {
    throw new Error('WALLET_ENCRYPTION_KEY environment variable not set');
  }

  // Split the encrypted data
  const parts = encryptedData.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted data format');
  }

  const [saltHex, ivHex, authTagHex, encrypted] = parts;

  // Convert from hex
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  // Derive the same key
  const key = crypto.scryptSync(masterKey, salt, keyLength);

  // Create decipher
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  // Decrypt
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function hashData(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
