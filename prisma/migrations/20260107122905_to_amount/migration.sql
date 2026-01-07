/*
  Warnings:

  - Added the required column `toAmount` to the `SwapOrder` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SwapOrder" ADD COLUMN     "toAmount" DECIMAL(38,18) NOT NULL;
