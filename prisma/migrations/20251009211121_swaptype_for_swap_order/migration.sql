/*
  Warnings:

  - Added the required column `swapType` to the `SwapOrder` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SwapType" AS ENUM ('TOKENTOFIAT', 'FIATTOTOKEN');

-- AlterTable
ALTER TABLE "SwapOrder" ADD COLUMN     "swapType" "SwapType" NOT NULL;
