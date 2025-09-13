import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class KeyManagementService {
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const masterKey = this.configService.get<string>('MASTER_KEY');
    if (!masterKey) {
      throw new Error('MASTER_KEY is not set in the environment variables');
    }
    this.encryptionKey = Buffer.from(masterKey, 'base64');
  }

  async storePrivateKey(userId: string, privateKey: string): Promise<void> {
    // Generate unique encryption key for this user
    const userKey = randomBytes(32);
    const iv = randomBytes(16);

    // Encrypt the private key
    const cipher = createCipheriv('aes-256-gcm', userKey, iv);
    const encryptedKey = Buffer.concat([
      cipher.update(privateKey, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Encrypt the user's encryption key with master key
    const masterCipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encryptedUserKey = Buffer.concat([
      masterCipher.update(userKey),
      masterCipher.final(),
    ]);
    const masterAuthTag = masterCipher.getAuthTag();

    // Store encrypted data
    await this.prisma.encryptedKey.create({
      data: {
        userId,
        encryptedPrivateKey: encryptedKey.toString('base64'),
        encryptedUserKey: encryptedUserKey.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        masterAuthTag: masterAuthTag.toString('base64'),
      },
    });
  }

  async getPrivateKey(userId: string): Promise<string> {
    const encryptedData = await this.prisma.encryptedKey.findUnique({
      where: { userId },
    });

    if (!encryptedData) {
      throw new NotFoundException('Private key not found');
    }

    // Decrypt user's encryption key
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const masterDecipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      iv,
    );
    masterDecipher.setAuthTag(
      Buffer.from(encryptedData.masterAuthTag, 'base64'),
    );
    const userKey = Buffer.concat([
      masterDecipher.update(
        Buffer.from(encryptedData.encryptedUserKey, 'base64'),
      ),
      masterDecipher.final(),
    ]);

    // Decrypt private key
    const decipher = createDecipheriv('aes-256-gcm', userKey, iv);
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'base64'));
    const privateKey = Buffer.concat([
      decipher.update(Buffer.from(encryptedData.encryptedPrivateKey, 'base64')),
      decipher.final(),
    ]);

    return privateKey.toString('utf8');
  }
}
