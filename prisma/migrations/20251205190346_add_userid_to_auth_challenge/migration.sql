-- First, add the column as nullable
ALTER TABLE "AuthChallenge" ADD COLUMN "userId" TEXT;

-- Set a default user ID for existing records (use a valid user ID from your database)
-- You might want to replace 'some-valid-user-id' with an actual user ID
UPDATE "AuthChallenge" SET "userId" = (SELECT "id" FROM "User" LIMIT 1) WHERE "userId" IS NULL;

-- Now make the column required
ALTER TABLE "AuthChallenge" ALTER COLUMN "userId" SET NOT NULL;

-- Add the foreign key constraint
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
