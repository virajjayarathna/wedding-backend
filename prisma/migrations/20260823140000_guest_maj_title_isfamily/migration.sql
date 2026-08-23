-- Add "Maj." as a guest title, and an independent isFamily flag so any
-- titled guest (not just the deprecated FAMILY title) can be suffixed
-- "and Family" on the invite, PDF, and WhatsApp message.
ALTER TYPE "GuestTitle" ADD VALUE 'MAJ';
ALTER TABLE "Guest" ADD COLUMN "isFamily" BOOLEAN NOT NULL DEFAULT false;
