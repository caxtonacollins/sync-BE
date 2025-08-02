/*
  Warnings:

  - You are about to drop the column `accountName` on the `FiatAccount` table. All the data in the column will be lost.
  - You are about to drop the column `accountNumber` on the `FiatAccount` table. All the data in the column will be lost.
  - You are about to drop the column `bankCode` on the `FiatAccount` table. All the data in the column will be lost.
  - You are about to drop the column `bankName` on the `FiatAccount` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[accountReference]` on the table `FiatAccount` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[reservationReference]` on the table `FiatAccount` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "FiatAccount" DROP COLUMN "accountName",
DROP COLUMN "accountNumber",
DROP COLUMN "bankCode",
DROP COLUMN "bankName",
ADD COLUMN     "accountReference" TEXT,
ADD COLUMN     "accounts" JSONB,
ADD COLUMN     "collectionChannel" TEXT,
ADD COLUMN     "contractCode" TEXT,
ADD COLUMN     "customerEmail" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "defaultAccountName" TEXT,
ADD COLUMN     "defaultAccountNumber" TEXT,
ADD COLUMN     "defaultBankCode" TEXT,
ADD COLUMN     "defaultBankName" TEXT,
ADD COLUMN     "reservationReference" TEXT,
ADD COLUMN     "reservedAccountType" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "FiatAccount_accountReference_key" ON "FiatAccount"("accountReference");

-- CreateIndex
CREATE UNIQUE INDEX "FiatAccount_reservationReference_key" ON "FiatAccount"("reservationReference");
