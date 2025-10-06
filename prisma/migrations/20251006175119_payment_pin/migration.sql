-- AlterTable
ALTER TABLE "User" ADD COLUMN     "paymentPinAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentPinHash" TEXT,
ADD COLUMN     "paymentPinLockedUntil" TIMESTAMP(3);
