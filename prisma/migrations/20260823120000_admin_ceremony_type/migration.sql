-- Ceremony type per admin account: WEDDING keeps the original invitation
-- wording (bride first), HOME_COMING flips the couple to groom first.
CREATE TYPE "CeremonyType" AS ENUM ('WEDDING', 'HOME_COMING');

-- NOT NULL with a default, so every existing admin lands on WEDDING and the
-- current invitations keep rendering exactly as they do today.
ALTER TABLE "Admin" ADD COLUMN "ceremonyType" "CeremonyType" NOT NULL DEFAULT 'WEDDING';
