-- AlterTable
ALTER TABLE "User" ADD COLUMN     "currentChallenge" TEXT;

-- CreateTable
CREATE TABLE "PasskeyAuthenticator" (
    "id" TEXT NOT NULL,
    "credentialID" TEXT NOT NULL,
    "credentialPublicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL,
    "credentialDeviceType" TEXT NOT NULL,
    "credentialBackedUp" BOOLEAN NOT NULL,
    "transports" TEXT[],
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasskeyAuthenticator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasskeyAuthenticator_credentialID_key" ON "PasskeyAuthenticator"("credentialID");

-- CreateIndex
CREATE INDEX "PasskeyAuthenticator_userId_idx" ON "PasskeyAuthenticator"("userId");

-- AddForeignKey
ALTER TABLE "PasskeyAuthenticator" ADD CONSTRAINT "PasskeyAuthenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
