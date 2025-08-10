-- AlterTable
ALTER TABLE "FiatAccount" ADD COLUMN     "accountReference" TEXT,
ADD COLUMN     "accounts" JSONB,
ADD COLUMN     "collectionChannel" TEXT,
ADD COLUMN     "contractCode" TEXT,
ADD COLUMN     "customerEmail" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "reservationReference" TEXT,
ADD COLUMN     "reservedAccountType" TEXT;
