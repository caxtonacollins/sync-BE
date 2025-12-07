/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `PasskeyAuthenticator` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PasskeyAuthenticator_userId_key" ON "PasskeyAuthenticator"("userId");
