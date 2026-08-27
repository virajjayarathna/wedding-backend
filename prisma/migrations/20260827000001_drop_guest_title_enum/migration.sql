-- Step 2 of 2: drop the now-unused "GuestTitle" enum type.
--
-- Only run this after confirming (via the previous migration's verify query)
-- that Guest.title data came through the text conversion untouched. This
-- statement only removes the type definition from the catalog — it does not
-- touch any table rows. If anything still referenced the type, Postgres
-- would refuse this with an error rather than silently damage data.
DROP TYPE "GuestTitle";
