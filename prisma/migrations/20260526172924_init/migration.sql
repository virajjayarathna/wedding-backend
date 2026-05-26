-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MusicType" AS ENUM ('SPOTIFY', 'UPLOAD');

-- CreateEnum
CREATE TYPE "GuestTitle" AS ENUM ('MR', 'MRS', 'MS', 'DR', 'FAMILY', 'MASTER');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('PENDING', 'ATTENDING', 'DECLINING', 'MAYBE');

-- CreateTable
CREATE TABLE "SuperAdmin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "status" "AdminStatus" NOT NULL DEFAULT 'PENDING',
    "subscriptionStart" TIMESTAMP(3),
    "subscriptionEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeddingDetails" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "brideName" TEXT NOT NULL,
    "groomName" TEXT NOT NULL,
    "weddingDate" TIMESTAMP(3) NOT NULL,
    "weddingSlug" TEXT NOT NULL,
    "loveStory" TEXT,
    "coverPhotoUrl" TEXT,
    "heroPhotoUrl" TEXT,
    "galleryUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "venueName" TEXT,
    "venueAddress" TEXT,
    "venueMapsUrl" TEXT,
    "bridePhone" TEXT,
    "groomPhone" TEXT,
    "timeline" JSONB NOT NULL DEFAULT '[]',
    "musicUrl" TEXT,
    "musicType" "MusicType",
    "primaryColor" TEXT NOT NULL DEFAULT '#c0b258',
    "accentColor" TEXT NOT NULL DEFAULT '#333333',
    "fontFamily" TEXT NOT NULL DEFAULT 'Playfair Display',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeddingDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "title" "GuestTitle" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "maxAttendants" INTEGER NOT NULL DEFAULT 1,
    "token" TEXT NOT NULL,
    "rsvpStatus" "RsvpStatus" NOT NULL DEFAULT 'PENDING',
    "attendingCount" INTEGER,
    "dietaryNotes" TEXT,
    "notes" TEXT,
    "rsvpSubmittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SuperAdmin_email_key" ON "SuperAdmin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE INDEX "Admin_status_idx" ON "Admin"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WeddingDetails_adminId_key" ON "WeddingDetails"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "WeddingDetails_weddingSlug_key" ON "WeddingDetails"("weddingSlug");

-- CreateIndex
CREATE INDEX "WeddingDetails_weddingSlug_idx" ON "WeddingDetails"("weddingSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Guest_token_key" ON "Guest"("token");

-- CreateIndex
CREATE INDEX "Guest_weddingId_rsvpStatus_idx" ON "Guest"("weddingId", "rsvpStatus");

-- CreateIndex
CREATE INDEX "Guest_token_idx" ON "Guest"("token");

-- AddForeignKey
ALTER TABLE "WeddingDetails" ADD CONSTRAINT "WeddingDetails_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "WeddingDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
