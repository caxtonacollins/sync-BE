-- CreateTable
CREATE TABLE "LiquidityPool" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiquidityPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolHistory" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "blockNumber" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoolHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "fiatSymbol" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiquidityPool_symbol_key" ON "LiquidityPool"("symbol");

-- CreateIndex
CREATE INDEX "PoolHistory_poolId_idx" ON "PoolHistory"("poolId");

-- CreateIndex
CREATE INDEX "PoolHistory_transactionHash_idx" ON "PoolHistory"("transactionHash");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_fiatSymbol_tokenSymbol_key" ON "ExchangeRate"("fiatSymbol", "tokenSymbol");

-- AddForeignKey
ALTER TABLE "PoolHistory" ADD CONSTRAINT "PoolHistory_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "LiquidityPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
