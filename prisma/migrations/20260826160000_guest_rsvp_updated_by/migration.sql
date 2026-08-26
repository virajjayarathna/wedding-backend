-- Tracks who last set rsvpStatus: the guest via their invite link, or an admin
-- editing manually on /guests. Null until the first status change.
CREATE TYPE "RsvpUpdatedBy" AS ENUM ('ADMIN', 'GUEST');
ALTER TABLE "Guest" ADD COLUMN "rsvpUpdatedBy" "RsvpUpdatedBy";
