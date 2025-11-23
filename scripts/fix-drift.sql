-- Fix drift: Apply missing migration changes
-- Run this in Supabase SQL Editor

-- Remove perCustomerLimit column from OfferDiscountType
ALTER TABLE "OfferDiscountType" DROP COLUMN IF EXISTS "perCustomerLimit";

-- Remove buyerId column and indexes from OfferUsageTracking
DROP INDEX IF EXISTS "OfferUsageTracking_buyerId_idx";
DROP INDEX IF EXISTS "OfferUsageTracking_offerId_discountTypeId_buyerId_key";
ALTER TABLE "OfferUsageTracking" DROP COLUMN IF EXISTS "buyerId";

