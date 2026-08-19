-- Full colour/typography theming for the invitation site.
--
-- New columns are all nullable: NULL means "inherit from the chosen preset",
-- and an unset preset resolves to 'classic-gold', which reproduces the
-- previous hard-coded design exactly.
ALTER TABLE "WeddingDetails" ADD COLUMN "themePreset" TEXT;
ALTER TABLE "WeddingDetails" ADD COLUMN "bgColor" TEXT;
ALTER TABLE "WeddingDetails" ADD COLUMN "surfaceColor" TEXT;
ALTER TABLE "WeddingDetails" ADD COLUMN "cardColor" TEXT;
ALTER TABLE "WeddingDetails" ADD COLUMN "textColor" TEXT;
ALTER TABLE "WeddingDetails" ADD COLUMN "mutedColor" TEXT;
ALTER TABLE "WeddingDetails" ADD COLUMN "bodyFont" TEXT;

-- primaryColor / accentColor / fontFamily existed already but were never read
-- by the invite site — it rendered a fixed gold/ivory palette regardless. Make
-- them nullable so they can express "inherit from preset" like the new columns.
ALTER TABLE "WeddingDetails" ALTER COLUMN "primaryColor" DROP NOT NULL;
ALTER TABLE "WeddingDetails" ALTER COLUMN "primaryColor" DROP DEFAULT;
ALTER TABLE "WeddingDetails" ALTER COLUMN "accentColor" DROP NOT NULL;
ALTER TABLE "WeddingDetails" ALTER COLUMN "accentColor" DROP DEFAULT;
ALTER TABLE "WeddingDetails" ALTER COLUMN "fontFamily" DROP NOT NULL;
ALTER TABLE "WeddingDetails" ALTER COLUMN "fontFamily" DROP DEFAULT;

-- Clear the existing values. This is not data loss: none of these were ever
-- rendered, so no couple has seen or approved them, and several are actively
-- wrong under the new model (accentColor's '#333333' default is a dark grey
-- being used as the *light* accent). Clearing them means every existing
-- wedding resolves to Classic Gold and therefore looks exactly as it does
-- today, instead of inheriting a palette nobody chose.
UPDATE "WeddingDetails" SET "primaryColor" = NULL, "accentColor" = NULL, "fontFamily" = NULL;
