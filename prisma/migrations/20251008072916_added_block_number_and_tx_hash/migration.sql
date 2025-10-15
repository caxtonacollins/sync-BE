-- AlterTable
ALTER TABLE "SwapOrder" ADD COLUMN     "blockNumber" TEXT,
ADD COLUMN     "transactionHash" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "blockNumber" TEXT,
ADD COLUMN     "transactionHash" TEXT;

-- CreateIndex
CREATE INDEX "SwapOrder_userId_idx" ON "SwapOrder"("userId");

-- CreateIndex
CREATE INDEX "SwapOrder_status_idx" ON "SwapOrder"("status");

-- CreateIndex
CREATE INDEX "SwapOrder_fromCurrency_toCurrency_idx" ON "SwapOrder"("fromCurrency", "toCurrency");

-- CreateIndex
CREATE INDEX "SwapOrder_transactionHash_idx" ON "SwapOrder"("transactionHash");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_reference_idx" ON "Transaction"("reference");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_transactionHash_idx" ON "Transaction"("transactionHash");
