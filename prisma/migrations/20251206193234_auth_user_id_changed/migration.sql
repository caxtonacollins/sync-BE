/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `AuthChallenge` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "AuthChallenge_userId_key" ON "AuthChallenge"("userId");
