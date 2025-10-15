/*
  Warnings:

  - You are about to drop the `ExchangeRate` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "FiatAccount" ADD COLUMN     "availableBalance" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "ledgerBalance" DOUBLE PRECISION DEFAULT 0;

-- DropTable
DROP TABLE "ExchangeRate";
