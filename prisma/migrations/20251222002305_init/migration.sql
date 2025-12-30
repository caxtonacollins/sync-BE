-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "StakeStatus" AS ENUM ('ACTIVE', 'UNSTAKED', 'EMERGENCY_WITHDRAWN');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'STAKE', 'UNSTAKE_PRINCIPAL', 'STAKING_REWARD', 'BUY', 'SELL', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SwapType" AS ENUM ('MARKET', 'LIMIT', 'STOP_LIMIT', 'OCO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLogin" TIMESTAMP(3),
    "bvn" TEXT,
    "nin" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "postalCode" TEXT,
    "idType" TEXT,
    "idNumber" TEXT,
    "idFrontImage" TEXT,
    "idBackImage" TEXT,
    "selfieImage" TEXT,
    "starknetAccountAddress" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "paymentPinHash" TEXT,
    "paymentPinAttempts" INTEGER NOT NULL DEFAULT 0,
    "paymentPinLockedUntil" TIMESTAMP(3),
    "webauthnUserID" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasskeyAuthenticator" (
    "id" TEXT NOT NULL,
    "credentialID" TEXT NOT NULL,
    "credentialPublicKey" TEXT NOT NULL,
    "counter" BIGINT NOT NULL,
    "credentialDeviceType" TEXT NOT NULL,
    "credentialBackedUp" BOOLEAN NOT NULL,
    "transports" TEXT[],
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasskeyAuthenticator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoBalance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "available" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "staked" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "pending" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptoBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoStakingPool" (
    "id" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'starknet',
    "baseApyBps" INTEGER NOT NULL,
    "bonusApyBps" INTEGER NOT NULL,
    "minStakeAmount" DECIMAL(38,18) NOT NULL,
    "maxStakeAmount" DECIMAL(38,18) NOT NULL,
    "totalStaked" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "totalStakers" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "contractAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptoStakingPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoStake" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "lockDays" INTEGER NOT NULL,
    "lockDurationSeconds" BIGINT NOT NULL,
    "stakedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlockAt" TIMESTAMP(3) NOT NULL,
    "unstakedAt" TIMESTAMP(3),
    "lastRewardClaim" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewardsClaimed" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "status" "StakeStatus" NOT NULL DEFAULT 'ACTIVE',
    "baseApyBps" INTEGER NOT NULL,
    "bonusApyBps" INTEGER NOT NULL,
    "effectiveApyBps" INTEGER NOT NULL,
    "onChainTxHash" TEXT,
    "onChainStakeId" INTEGER,
    "onChainRecorded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptoStake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerkleTreeBatch" (
    "id" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "merkleRoot" TEXT NOT NULL,
    "totalStakes" INTEGER NOT NULL,
    "totalAmount" DECIMAL(20,2) NOT NULL,
    "leaves" JSONB NOT NULL,
    "onChainTxHash" TEXT,
    "onChainBatchId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerkleTreeBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "encryptedPrivateKey" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isRegisteredToLiquidity" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CryptoWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "fee" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(38,18) NOT NULL,
    "reference" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "blockNumber" TEXT,
    "transactionHash" TEXT,
    "cryptoWalletId" TEXT,
    "swapOrderId" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwapOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "rate" DECIMAL(20,8),
    "swapType" "SwapType" NOT NULL,
    "fee" DECIMAL(38,18),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "blockNumber" TEXT,
    "transactionHash" TEXT,

    CONSTRAINT "SwapOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActive" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deviceInfo" JSONB,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncryptedKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedPrivateKey" TEXT NOT NULL,
    "encryptedUserKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "masterAuthTag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EncryptedKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidityPool" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "balance" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiquidityPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolHistory" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "type" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "blockNumber" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoolHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "fiatSymbol" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "rate" DECIMAL(20,8) NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_starknetAccountAddress_key" ON "User"("starknetAccountAddress");

-- CreateIndex
CREATE UNIQUE INDEX "User_webauthnUserID_key" ON "User"("webauthnUserID");

-- CreateIndex
CREATE UNIQUE INDEX "PasskeyAuthenticator_credentialID_key" ON "PasskeyAuthenticator"("credentialID");

-- CreateIndex
CREATE UNIQUE INDEX "PasskeyAuthenticator_userId_key" ON "PasskeyAuthenticator"("userId");

-- CreateIndex
CREATE INDEX "PasskeyAuthenticator_userId_idx" ON "PasskeyAuthenticator"("userId");

-- CreateIndex
CREATE INDEX "CryptoBalance_userId_idx" ON "CryptoBalance"("userId");

-- CreateIndex
CREATE INDEX "CryptoBalance_tokenSymbol_idx" ON "CryptoBalance"("tokenSymbol");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoBalance_userId_tokenSymbol_network_key" ON "CryptoBalance"("userId", "tokenSymbol", "network");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoStakingPool_tokenSymbol_key" ON "CryptoStakingPool"("tokenSymbol");

-- CreateIndex
CREATE INDEX "CryptoStakingPool_tokenSymbol_idx" ON "CryptoStakingPool"("tokenSymbol");

-- CreateIndex
CREATE INDEX "CryptoStakingPool_isActive_idx" ON "CryptoStakingPool"("isActive");

-- CreateIndex
CREATE INDEX "CryptoStake_userId_tokenSymbol_status_idx" ON "CryptoStake"("userId", "tokenSymbol", "status");

-- CreateIndex
CREATE INDEX "CryptoStake_status_idx" ON "CryptoStake"("status");

-- CreateIndex
CREATE INDEX "CryptoStake_poolId_idx" ON "CryptoStake"("poolId");

-- CreateIndex
CREATE INDEX "CryptoStake_onChainTxHash_idx" ON "CryptoStake"("onChainTxHash");

-- CreateIndex
CREATE INDEX "MerkleTreeBatch_tokenSymbol_idx" ON "MerkleTreeBatch"("tokenSymbol");

-- CreateIndex
CREATE INDEX "MerkleTreeBatch_onChainBatchId_idx" ON "MerkleTreeBatch"("onChainBatchId");

-- CreateIndex
CREATE INDEX "MerkleTreeBatch_createdAt_idx" ON "MerkleTreeBatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_reference_key" ON "Transaction"("reference");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_reference_idx" ON "Transaction"("reference");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_transactionHash_idx" ON "Transaction"("transactionHash");

-- CreateIndex
CREATE UNIQUE INDEX "SwapOrder_reference_key" ON "SwapOrder"("reference");

-- CreateIndex
CREATE INDEX "SwapOrder_userId_idx" ON "SwapOrder"("userId");

-- CreateIndex
CREATE INDEX "SwapOrder_status_idx" ON "SwapOrder"("status");

-- CreateIndex
CREATE INDEX "SwapOrder_from_to_idx" ON "SwapOrder"("from", "to");

-- CreateIndex
CREATE INDEX "SwapOrder_transactionHash_idx" ON "SwapOrder"("transactionHash");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "EncryptedKey_userId_key" ON "EncryptedKey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "LiquidityPool_symbol_key" ON "LiquidityPool"("symbol");

-- CreateIndex
CREATE INDEX "PoolHistory_poolId_idx" ON "PoolHistory"("poolId");

-- CreateIndex
CREATE INDEX "PoolHistory_transactionHash_idx" ON "PoolHistory"("transactionHash");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_fiatSymbol_tokenSymbol_key" ON "ExchangeRate"("fiatSymbol", "tokenSymbol");

-- CreateIndex
CREATE UNIQUE INDEX "AuthChallenge_userId_key" ON "AuthChallenge"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthChallenge_challenge_key" ON "AuthChallenge"("challenge");

-- CreateIndex
CREATE INDEX "AuthChallenge_expiresAt_idx" ON "AuthChallenge"("expiresAt");

-- AddForeignKey
ALTER TABLE "PasskeyAuthenticator" ADD CONSTRAINT "PasskeyAuthenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoBalance" ADD CONSTRAINT "CryptoBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoStake" ADD CONSTRAINT "CryptoStake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoStake" ADD CONSTRAINT "CryptoStake_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "CryptoStakingPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoWallet" ADD CONSTRAINT "CryptoWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_cryptoWalletId_fkey" FOREIGN KEY ("cryptoWalletId") REFERENCES "CryptoWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_swapOrderId_fkey" FOREIGN KEY ("swapOrderId") REFERENCES "SwapOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwapOrder" ADD CONSTRAINT "SwapOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptedKey" ADD CONSTRAINT "EncryptedKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolHistory" ADD CONSTRAINT "PoolHistory_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "LiquidityPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
