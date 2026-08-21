-- cuid() default made guest.token enumerable (timestamp-based, sequential-ish).
-- Application code now always supplies a CSPRNG token on insert; drop the
-- guessable DB-level default so no code path can silently fall back to it.
-- Existing rows keep their current (already-issued) tokens untouched.
ALTER TABLE "Guest" ALTER COLUMN "token" DROP DEFAULT;
