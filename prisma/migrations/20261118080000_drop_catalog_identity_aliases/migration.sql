-- CatalogIdentityAlias is no longer part of the catalog identity design.
-- Keep prior migration files immutable for Prisma checksum compatibility, then
-- remove the table here. Historical buyer/supplier text snapshots and canonical
-- VariantOption links remain on their owning records.
DROP TABLE IF EXISTS "CatalogIdentityAlias" CASCADE;
