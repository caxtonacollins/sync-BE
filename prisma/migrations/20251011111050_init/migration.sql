/*
  Warnings:

  - Added the required column `encryptedPrivateKey` to the `CryptoWallet` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CryptoWallet" ADD COLUMN     "encryptedPrivateKey" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "SwapOrder" ALTER COLUMN "swapType" DROP NOT NULL;
