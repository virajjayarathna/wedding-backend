-- Manual "Sent" checkbox on the admin Guests page, tracking whether the invite was sent.
ALTER TABLE "Guest" ADD COLUMN "sent" BOOLEAN NOT NULL DEFAULT false;
