-- Guest.title becomes a plain string so admins can type a custom title
-- (e.g. "Rev.", "Justice") instead of being limited to the fixed enum list.
ALTER TABLE "Guest" ALTER COLUMN "title" TYPE TEXT USING "title"::TEXT;
DROP TYPE "GuestTitle";
