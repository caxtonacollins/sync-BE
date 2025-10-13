import { Injectable, UnauthorizedException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Account, RpcProvider } from 'starknet';
import { decryptPrivateKey } from '../contract/utils';
import { connectToStarknet } from '../contract/utils';

/**
 * KeyManagementService
 * 
 * Handles secure retrieval and usage of user private keys for transaction signing.
 * 
 * SECURITY PRINCIPLES:
 * 1. Private keys are NEVER returned to the client
 * 2. Keys are only decrypted in memory when needed for signing
 * 3. Decrypted keys are immediately discarded after use
 * 4. All key access is logged for audit purposes
 * 5. User authentication is required before any key operations
 */
@Injectable()
export class KeyManagementService {
  private readonly logger = new Logger(KeyManagementService.name);
  private provider: RpcProvider;
  private readonly prisma: PrismaService;

  constructor() {
    this.prisma = new PrismaService();
    this.provider = connectToStarknet();
  }

  /**
   * Get a user's Account instance for signing transactions
   * This method decrypts the private key in memory and creates an Account object
   * 
   * @param userId - The authenticated user's ID
   * @param walletAddress - Optional specific wallet address (defaults to default wallet)
   * @returns Account instance ready for signing transactions
   */
  async getUserAccount(userId: string, walletAddress?: string): Promise<Account> {
    try {
      const wallet = await this.prisma.cryptoWallet.findFirst({
        where: {
          userId,
          isActive: true,
          ...(walletAddress ? { address: walletAddress } : { isDefault: true }),
        },
      });

      if (!wallet) {
        this.logger.error(`No active wallet found for user ${userId}`);
        throw new NotFoundException('Wallet not found');
      }

      if (!wallet.encryptedPrivateKey) {
        this.logger.error(`No encrypted private key found for wallet ${wallet.id}`);
        throw new NotFoundException('Private key not found for this wallet');
      }

      // Decrypt the private key (only in memory, never persisted)
      const privateKey = decryptPrivateKey(wallet.encryptedPrivateKey);

      // Create and return the Account instance
      const account = new Account(this.provider, wallet.address, privateKey);

      this.logger.log(`Account accessed for user ${userId}, wallet ${wallet.address}`);

      return account;
    } catch (error) {
      this.logger.error(`Failed to get user account: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute a transaction on behalf of the user
   * This is the secure way to sign transactions without exposing private keys
   * 
   * @param userId - The authenticated user's ID
   * @param calls - Array of contract calls to execute
   * @param walletAddress - Optional specific wallet address
   * @returns Transaction hash and receipt
   */
  async executeTransaction(
    userId: string,
    calls: any[],
    walletAddress?: string,
  ): Promise<{ transactionHash: string; receipt?: any }> {
    try {
      // Get the user's account (with decrypted key in memory)
      const account = await this.getUserAccount(userId, walletAddress);

      // Execute the transaction
      const { transaction_hash } = await account.execute(calls, {
        maxFee: 10 ** 15,
      });

      this.logger.log(`Transaction executed for user ${userId}: ${transaction_hash}`);

      // Wait for transaction confirmation
      const receipt = await this.provider.waitForTransaction(transaction_hash);

      // Log transaction completion
      await this.createAuditLog(userId, 'TRANSACTION_EXECUTED', {
        transactionHash: transaction_hash,
        success: receipt.isSuccess(),
        walletAddress: walletAddress || 'default',
      });

      return {
        transactionHash: transaction_hash,
        receipt,
      };
    } catch (error) {
      this.logger.error(`Transaction execution failed for user ${userId}: ${error.message}`);
      
      // Log the failure
      await this.createAuditLog(userId, 'TRANSACTION_FAILED', {
        error: error.message,
        walletAddress: walletAddress || 'default',
      });

      throw error;
    }
  }

  /**
   * Get user's wallet address without exposing private key
   * 
   * @param userId - The authenticated user's ID
   * @returns Wallet address
   */
  async getUserWalletAddress(userId: string): Promise<string> {
    const wallet = await this.prisma.cryptoWallet.findFirst({
      where: {
        userId,
        isActive: true,
        isDefault: true,
      },
      select: {
        address: true,
      },
    });

    if (!wallet) {
      throw new NotFoundException('No active wallet found');
    }

    return wallet.address;
  }

  /**
   * Verify that a user owns a specific wallet address
   * 
   * @param userId - The authenticated user's ID
   * @param walletAddress - The wallet address to verify
   * @returns boolean indicating ownership
   */
  async verifyWalletOwnership(userId: string, walletAddress: string): Promise<boolean> {
    const wallet = await this.prisma.cryptoWallet.findFirst({
      where: {
        userId,
        address: walletAddress,
        isActive: true,
      },
    });

    return !!wallet;
  }

  /**
   * Create an audit log entry for key access and usage
   * 
   * @param userId - User ID
   * @param action - Action performed
   * @param metadata - Additional metadata
   */
  private async createAuditLog(
    userId: string,
    action: string,
    metadata: any,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action,
          entityType: 'CryptoWallet',
          metadata,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error.message}`);
    }
  }

  /**
   * Get all active wallets for a user (without private keys)
   * 
   * @param userId - The authenticated user's ID
   * @returns Array of wallet information
   */
  async getUserWallets(userId: string) {
    return this.prisma.cryptoWallet.findMany({
      where: {
        userId,
        isActive: true,
      },
      select: {
        id: true,
        address: true,
        network: true,
        currency: true,
        isDefault: true,
        createdAt: true,
      },
    });
  }
}
