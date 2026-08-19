-- AlterTable: image shown as the WhatsApp / social link preview (og:image)
-- for guest invitation links. Nullable so existing weddings keep working and
-- fall back to the cover / hero photo until an admin uploads a dedicated one.
ALTER TABLE "WeddingDetails" ADD COLUMN "sharePreviewUrl" TEXT;
