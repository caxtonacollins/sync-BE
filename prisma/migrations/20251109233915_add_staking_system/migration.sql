/*
  Warnings:

  - A unique constraint covering the columns `[starknetAccountAddress]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "StakeStatus" AS ENUM ('ACTIVE', 'UNSTAKED', 'EMERGENCY_WITHDRAWN');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'STAKE', 'UNSTAKE_PRINCIPAL', 'STAKING_REWARD', 'SWAP_FIAT_TO_CRYPTO', 'SWAP_CRYPTO_TO_FIAT', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "starknetAccountAddress" TEXT;

-- CreateTable
CREATE TABLE "FiatBalance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "available" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "staked" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "pending" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiatBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoBalance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "available" DECIMAL(30,18) NOT NULL DEFAULT 0,
    "staked" DECIMAL(30,18) NOT NULL DEFAULT 0,
    "pending" DECIMAL(30,18) NOT NULL DEFAULT 0,
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
    "minStakeAmount" DECIMAL(30,18) NOT NULL,
    "maxStakeAmount" DECIMAL(30,18) NOT NULL,
    "totalStaked" DECIMAL(30,18) NOT NULL DEFAULT 0,
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
    "amount" DECIMAL(30,18) NOT NULL,
    "lockDays" INTEGER NOT NULL,
    "lockDurationSeconds" BIGINT NOT NULL,
    "stakedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlockAt" TIMESTAMP(3) NOT NULL,
    "unstakedAt" TIMESTAMP(3),
    "lastRewardClaim" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewardsClaimed" DECIMAL(30,18) NOT NULL DEFAULT 0,
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
CREATE TABLE "FiatStakingPool" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "baseApyBps" INTEGER NOT NULL,
    "bonusApyBps" INTEGER NOT NULL,
    "minStakeAmount" DECIMAL(20,2) NOT NULL,
    "maxStakeAmount" DECIMAL(20,2) NOT NULL,
    "totalStaked" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "totalStakers" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "bankAccountReference" TEXT,
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "contractAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiatStakingPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiatStake" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "lockDays" INTEGER NOT NULL,
    "lockDurationSeconds" BIGINT NOT NULL,
    "stakedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlockAt" TIMESTAMP(3) NOT NULL,
    "unstakedAt" TIMESTAMP(3),
    "lastRewardClaim" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewardsClaimed" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "status" "StakeStatus" NOT NULL DEFAULT 'ACTIVE',
    "baseApyBps" INTEGER NOT NULL,
    "bonusApyBps" INTEGER NOT NULL,
    "effectiveApyBps" INTEGER NOT NULL,
    "onChainTxHash" TEXT,
    "onChainStakeId" INTEGER,
    "onChainRecorded" BOOLEAN NOT NULL DEFAULT false,
    "merkleProofVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastVerifiedBatch" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiatStake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiatTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiatTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerkleTreeBatch" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
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
CREATE TABLE "ReserveSnapshot" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "totalStaked" DECIMAL(20,2) NOT NULL,
    "bankBalance" DECIMAL(20,2) NOT NULL,
    "reserveRatioBps" INTEGER NOT NULL,
    "ipfsHash" TEXT NOT NULL,
    "auditorSignature" TEXT,
    "onChainTxHash" TEXT,
    "onChainSnapshotId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReserveSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FiatBalance_userId_idx" ON "FiatBalance"("userId");

-- CreateIndex
CREATE INDEX "FiatBalance_currency_idx" ON "FiatBalance"("currency");

-- CreateIndex
CREATE UNIQUE INDEX "FiatBalance_userId_currency_key" ON "FiatBalance"("userId", "currency");

-- CreateIndex
CREATE INDEX "CryptoBalance_userId_idx" ON "CryptoBalance"("userId");

-- CreateIndex
CREATE INDEX "CryptoBalance_currency_idx" ON "CryptoBalance"("currency");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoBalance_userId_currency_network_key" ON "CryptoBalance"("userId", "currency", "network");

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
CREATE UNIQUE INDEX "FiatStakingPool_currency_key" ON "FiatStakingPool"("currency");

-- CreateIndex
CREATE INDEX "FiatStakingPool_currency_idx" ON "FiatStakingPool"("currency");

-- CreateIndex
CREATE INDEX "FiatStakingPool_isActive_idx" ON "FiatStakingPool"("isActive");

-- CreateIndex
CREATE INDEX "FiatStake_userId_currency_status_idx" ON "FiatStake"("userId", "currency", "status");

-- CreateIndex
CREATE INDEX "FiatStake_status_idx" ON "FiatStake"("status");

-- CreateIndex
CREATE INDEX "FiatStake_poolId_idx" ON "FiatStake"("poolId");

-- CreateIndex
CREATE INDEX "FiatStake_onChainTxHash_idx" ON "FiatStake"("onChainTxHash");

-- CreateIndex
CREATE INDEX "FiatTransaction_userId_currency_idx" ON "FiatTransaction"("userId", "currency");

-- CreateIndex
CREATE INDEX "FiatTransaction_type_idx" ON "FiatTransaction"("type");

-- CreateIndex
CREATE INDEX "FiatTransaction_status_idx" ON "FiatTransaction"("status");

-- CreateIndex
CREATE INDEX "FiatTransaction_reference_idx" ON "FiatTransaction"("reference");

-- CreateIndex
CREATE INDEX "MerkleTreeBatch_currency_idx" ON "MerkleTreeBatch"("currency");

-- CreateIndex
CREATE INDEX "MerkleTreeBatch_onChainBatchId_idx" ON "MerkleTreeBatch"("onChainBatchId");

-- CreateIndex
CREATE INDEX "MerkleTreeBatch_createdAt_idx" ON "MerkleTreeBatch"("createdAt");

-- CreateIndex
CREATE INDEX "ReserveSnapshot_currency_idx" ON "ReserveSnapshot"("currency");

-- CreateIndex
CREATE INDEX "ReserveSnapshot_onChainSnapshotId_idx" ON "ReserveSnapshot"("onChainSnapshotId");

-- CreateIndex
CREATE INDEX "ReserveSnapshot_createdAt_idx" ON "ReserveSnapshot"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_starknetAccountAddress_key" ON "User"("starknetAccountAddress");

-- AddForeignKey
ALTER TABLE "FiatBalance" ADD CONSTRAINT "FiatBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoBalance" ADD CONSTRAINT "CryptoBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoStake" ADD CONSTRAINT "CryptoStake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoStake" ADD CONSTRAINT "CryptoStake_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "CryptoStakingPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiatStake" ADD CONSTRAINT "FiatStake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiatStake" ADD CONSTRAINT "FiatStake_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "FiatStakingPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiatTransaction" ADD CONSTRAINT "FiatTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
