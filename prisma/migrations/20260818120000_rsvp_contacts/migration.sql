-- AlterTable: add flexible RSVP point-of-contact list to WeddingDetails
ALTER TABLE "WeddingDetails" ADD COLUMN "rsvpContacts" JSONB NOT NULL DEFAULT '[]';

-- AlterTable: replace fixed Bride/Groom RSVP contact selection on Guest
-- with optional references into WeddingDetails.rsvpContacts
ALTER TABLE "Guest" ADD COLUMN "firstRsvpContactId" TEXT;
ALTER TABLE "Guest" ADD COLUMN "secondRsvpContactId" TEXT;
ALTER TABLE "Guest" DROP COLUMN "brideRsvpContact";
ALTER TABLE "Guest" DROP COLUMN "groomRsvpContact";

-- DropEnum
DROP TYPE "BrideContact";
DROP TYPE "GroomContact";
