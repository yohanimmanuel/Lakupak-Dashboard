-- Optional evidence photos (Cloudinary URLs) on buyer reports against distributors.
ALTER TABLE "DistributorReport" ADD COLUMN "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
