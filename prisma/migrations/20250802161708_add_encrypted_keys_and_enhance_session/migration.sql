/*
  Warnings:

  - You are about to drop the column `accountReference` on the `FiatAccount` table. All the data in the column will be lost.
  - You are about to drop the column `accounts` on the `FiatAccount` table. All the data in the column will be lost.
  - You are about to drop the column `collectionChannel` on the `FiatAccount` table. All the data in the column will be lost.
  - You are about to drop the column `contractCode` on the `FiatAccount` table. All the data in the column will be lost.
  - You are about to drop the column `customerEmail` on the `FiatAccount` table. All the data in the column will be lost.
  - You are about to drop the column `customerName` on the `FiatAccount` table. All the data in the column will be lost.
  - You are about to drop the column `defaultAccountName` on the `FiatAccount` table. All the data in the column will be lost.
  - You are about to drop the column `defaultAccountNumber` on the `FiatAccount` table. All the data in the column will be lost.
  - You are about to drop the column `defaultBankCode` on the `FiatAccount` table. All the data in the column will be lost.
  - You are about to drop the column `defaultBankName` on the `FiatAccount` table. All the data in the column will be lost.
  - You are about to drop the column `reservationReference` on the `FiatAccount` table. All the data in the column will be lost.
  - You are about to drop the column `reservedAccountType` on the `FiatAccount` table. All the data in the column will be lost.
  - Added the required column `accountName` to the `FiatAccount` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountNumber` to the `FiatAccount` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "FiatAccount_accountReference_key";

-- DropIndex
DROP INDEX "FiatAccount_reservationReference_key";

-- AlterTable
ALTER TABLE "FiatAccount" 
ADD COLUMN     "accountName" TEXT,
ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "bankCode" TEXT,
ADD COLUMN     "bankName" TEXT;

-- Update existing records
UPDATE "FiatAccount" 
SET "accountName" = COALESCE("defaultAccountName", 'Migrated Account'),
    "accountNumber" = COALESCE("defaultAccountNumber", 'MIGRATED'),
    "bankCode" = COALESCE("defaultBankCode", NULL),
    "bankName" = COALESCE("defaultBankName", NULL);

-- Make columns required after data migration
ALTER TABLE "FiatAccount" 
ALTER COLUMN "accountName" SET NOT NULL,
ALTER COLUMN "accountNumber" SET NOT NULL;

-- Drop old columns
ALTER TABLE "FiatAccount"
DROP COLUMN "accountReference",
DROP COLUMN "accounts",
DROP COLUMN "collectionChannel",
DROP COLUMN "contractCode",
DROP COLUMN "customerEmail",
DROP COLUMN "customerName",
DROP COLUMN "defaultAccountName",
DROP COLUMN "defaultAccountNumber",
DROP COLUMN "defaultBankCode",
DROP COLUMN "defaultBankName",
DROP COLUMN "reservationReference",
DROP COLUMN "reservedAccountType";

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "deviceInfo" JSONB,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastActive" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

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

-- CreateIndex
CREATE UNIQUE INDEX "EncryptedKey_userId_key" ON "EncryptedKey"("userId");

-- AddForeignKey
ALTER TABLE "EncryptedKey" ADD CONSTRAINT "EncryptedKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
