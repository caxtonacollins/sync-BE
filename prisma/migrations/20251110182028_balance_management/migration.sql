/*
  Warnings:

  - You are about to alter the column `rate` on the `ExchangeRate` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(20,8)`.
  - You are about to alter the column `availableBalance` on the `FiatAccount` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(20,2)`.
  - You are about to alter the column `balance` on the `FiatAccount` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(20,2)`.
  - You are about to alter the column `ledgerBalance` on the `FiatAccount` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(20,2)`.
  - You are about to alter the column `balance` on the `LiquidityPool` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(38,18)`.
  - You are about to alter the column `amount` on the `PoolHistory` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(38,18)`.
  - You are about to alter the column `fromAmount` on the `SwapOrder` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(38,18)`.
  - You are about to alter the column `toAmount` on the `SwapOrder` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(38,18)`.
  - You are about to alter the column `rate` on the `SwapOrder` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(20,8)`.
  - You are about to alter the column `fee` on the `SwapOrder` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(38,18)`.
  - You are about to alter the column `amount` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(38,18)`.
  - You are about to alter the column `fee` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(38,18)`.
  - You are about to alter the column `netAmount` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(38,18)`.

*/
-- AlterTable
ALTER TABLE "CryptoBalance" ALTER COLUMN "available" SET DATA TYPE DECIMAL(38,18),
ALTER COLUMN "staked" SET DATA TYPE DECIMAL(38,18),
ALTER COLUMN "pending" SET DATA TYPE DECIMAL(38,18);

-- AlterTable
ALTER TABLE "CryptoStake" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(38,18),
ALTER COLUMN "rewardsClaimed" SET DATA TYPE DECIMAL(38,18);

-- AlterTable
ALTER TABLE "CryptoStakingPool" ALTER COLUMN "minStakeAmount" SET DATA TYPE DECIMAL(38,18),
ALTER COLUMN "maxStakeAmount" SET DATA TYPE DECIMAL(38,18),
ALTER COLUMN "totalStaked" SET DATA TYPE DECIMAL(38,18);

-- AlterTable
ALTER TABLE "ExchangeRate" ALTER COLUMN "rate" SET DATA TYPE DECIMAL(20,8);

-- AlterTable
ALTER TABLE "FiatAccount" ALTER COLUMN "availableBalance" SET DATA TYPE DECIMAL(20,2),
ALTER COLUMN "balance" SET DATA TYPE DECIMAL(20,2),
ALTER COLUMN "ledgerBalance" SET DATA TYPE DECIMAL(20,2);

-- AlterTable
ALTER TABLE "LiquidityPool" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(38,18);

-- AlterTable
ALTER TABLE "PoolHistory" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(38,18);

-- AlterTable
ALTER TABLE "SwapOrder" ALTER COLUMN "fromAmount" SET DATA TYPE DECIMAL(38,18),
ALTER COLUMN "toAmount" SET DATA TYPE DECIMAL(38,18),
ALTER COLUMN "rate" SET DATA TYPE DECIMAL(20,8),
ALTER COLUMN "fee" SET DATA TYPE DECIMAL(38,18);

-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(38,18),
ALTER COLUMN "fee" SET DATA TYPE DECIMAL(38,18),
ALTER COLUMN "netAmount" SET DATA TYPE DECIMAL(38,18);
