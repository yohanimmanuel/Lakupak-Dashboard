-- Invite/claim path replaced by Prospect access requests + distributor approval.
DROP TRIGGER IF EXISTS "BuyerMarketplaceInvite" ON "BuyerMarketplaceInvite";
DROP TABLE IF EXISTS "BuyerMarketplaceInvite";
