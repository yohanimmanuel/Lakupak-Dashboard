-- Convert String price columns to Decimal
-- Handle IDR format (dots as thousands, commas as decimals) and standard format

-- Helper function to parse price strings (handles both IDR and standard formats)
CREATE OR REPLACE FUNCTION parse_price_string(price_text TEXT) RETURNS DECIMAL(12,2) AS $$
DECLARE
  cleaned TEXT;
  has_comma BOOLEAN;
  has_dot BOOLEAN;
  comma_pos INTEGER;
  dot_pos INTEGER;
BEGIN
  -- Handle null/empty
  IF price_text IS NULL OR TRIM(price_text) = '' THEN
    RETURN NULL;
  END IF;
  
  -- Remove spaces and other non-numeric characters except dots and commas
  cleaned := REGEXP_REPLACE(price_text, '[^0-9.,]', '', 'g');
  
  has_comma := cleaned ~ ',';
  has_dot := cleaned ~ '\.';
  
  -- If no separators, return as number
  IF NOT has_comma AND NOT has_dot THEN
    RETURN CAST(cleaned AS DECIMAL(12,2));
  END IF;
  
  -- If both comma and dot exist
  IF has_comma AND has_dot THEN
    comma_pos := POSITION(',' IN cleaned);
    dot_pos := POSITION('.' IN cleaned);
    
    -- If comma comes after dot, it's IDR format (1.234,56)
    -- If dot comes after comma, it's standard format (1,234.56)
    IF comma_pos > dot_pos THEN
      -- IDR format: remove dots (thousands), replace comma with dot (decimal)
      cleaned := REPLACE(REPLACE(cleaned, '.', ''), ',', '.');
    ELSE
      -- Standard format: remove commas (thousands), keep dot (decimal)
      cleaned := REPLACE(cleaned, ',', '');
    END IF;
  ELSIF has_comma THEN
    -- Only comma - check if it's near the end (likely decimal in IDR: 1234,56)
    comma_pos := LENGTH(cleaned) - POSITION(',' IN REVERSE(cleaned)) + 1;
    IF LENGTH(cleaned) - comma_pos < 3 THEN
      -- Comma near end, treat as decimal separator (IDR)
      cleaned := REPLACE(cleaned, ',', '.');
    ELSE
      -- Comma as thousands separator, remove it
      cleaned := REPLACE(cleaned, ',', '');
    END IF;
  ELSIF has_dot THEN
    -- Only dot - check if it's near the end (likely decimal: 1234.56)
    dot_pos := LENGTH(cleaned) - POSITION('.' IN REVERSE(cleaned)) + 1;
    IF LENGTH(cleaned) - dot_pos < 3 THEN
      -- Dot near end, keep as decimal separator
      cleaned := cleaned;
    ELSE
      -- Dot as thousands separator (IDR: 1.234), remove it
      cleaned := REPLACE(cleaned, '.', '');
    END IF;
  END IF;
  
  RETURN CAST(cleaned AS DECIMAL(12,2));
EXCEPTION
  WHEN OTHERS THEN
    -- If parsing fails, return 0
    RETURN 0;
END;
$$ LANGUAGE plpgsql;

-- Step 1: Convert VariantOption.purchasePrice (String -> Decimal)
ALTER TABLE "VariantOption" 
ALTER COLUMN "purchasePrice" TYPE DECIMAL(12,2) 
USING parse_price_string("purchasePrice");

-- Step 2: Convert VariantOption.sellingPrice (String -> Decimal)
ALTER TABLE "VariantOption" 
ALTER COLUMN "sellingPrice" TYPE DECIMAL(12,2) 
USING parse_price_string("sellingPrice");

-- Step 3: Convert VariantOption.originalSellingPrice (String -> Decimal, nullable)
ALTER TABLE "VariantOption" 
ALTER COLUMN "originalSellingPrice" TYPE DECIMAL(12,2) 
USING parse_price_string("originalSellingPrice");

-- Step 4: Convert OrderItem.originalPriceSnapshot (String -> Decimal, nullable)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'OrderItem' 
    AND column_name = 'originalPriceSnapshot'
    AND data_type = 'character varying'
  ) THEN
    ALTER TABLE "OrderItem" 
    ALTER COLUMN "originalPriceSnapshot" TYPE DECIMAL(12,2) 
    USING parse_price_string("originalPriceSnapshot");
  END IF;
END $$;

-- Step 5: Convert Float columns to Decimal
-- Company shipping prices
ALTER TABLE "Company" 
ALTER COLUMN "additionalPricePerKm" TYPE DECIMAL(12,2) USING COALESCE("additionalPricePerKm", 0)::DECIMAL(12,2);

ALTER TABLE "Company" 
ALTER COLUMN "baseShippingPrice" TYPE DECIMAL(12,2) USING COALESCE("baseShippingPrice", 0)::DECIMAL(12,2);

ALTER TABLE "Company" 
ALTER COLUMN "baseShippingRadius" TYPE DECIMAL(12,2) USING COALESCE("baseShippingRadius", 0)::DECIMAL(12,2);

ALTER TABLE "Company" 
ALTER COLUMN "freeShippingThreshold" TYPE DECIMAL(12,2) USING COALESCE("freeShippingThreshold", 0)::DECIMAL(12,2);

ALTER TABLE "Company" 
ALTER COLUMN "maxShippingRadius" TYPE DECIMAL(12,2) USING COALESCE("maxShippingRadius", 0)::DECIMAL(12,2);

ALTER TABLE "Company" 
ALTER COLUMN "expressShippingPrice" TYPE DECIMAL(12,2) USING COALESCE("expressShippingPrice", 0)::DECIMAL(12,2);

ALTER TABLE "Company" 
ALTER COLUMN "nextDayShippingPrice" TYPE DECIMAL(12,2) USING COALESCE("nextDayShippingPrice", 0)::DECIMAL(12,2);

ALTER TABLE "Company" 
ALTER COLUMN "sameDayShippingPrice" TYPE DECIMAL(12,2) USING COALESCE("sameDayShippingPrice", 0)::DECIMAL(12,2);

-- Order prices
ALTER TABLE "Order" 
ALTER COLUMN "subtotal" TYPE DECIMAL(12,2) USING "subtotal"::DECIMAL(12,2);

ALTER TABLE "Order" 
ALTER COLUMN "discounts" TYPE DECIMAL(12,2) USING "discounts"::DECIMAL(12,2);

ALTER TABLE "Order" 
ALTER COLUMN "shippingFee" TYPE DECIMAL(12,2) USING "shippingFee"::DECIMAL(12,2);

ALTER TABLE "Order" 
ALTER COLUMN "totalAmount" TYPE DECIMAL(12,2) USING "totalAmount"::DECIMAL(12,2);

-- OrderItem prices
ALTER TABLE "OrderItem" 
ALTER COLUMN "subtotal" TYPE DECIMAL(12,2) USING "subtotal"::DECIMAL(12,2);

ALTER TABLE "OrderItem" 
ALTER COLUMN "pricePerPackage" TYPE DECIMAL(12,2) USING COALESCE("pricePerPackage", 0)::DECIMAL(12,2);

ALTER TABLE "OrderItem" 
ALTER COLUMN "discountPercentage" TYPE DECIMAL(5,2) USING COALESCE("discountPercentage", 0)::DECIMAL(5,2);

ALTER TABLE "OrderItem" 
ALTER COLUMN "discountAmount" TYPE DECIMAL(12,2) USING COALESCE("discountAmount", 0)::DECIMAL(12,2);

-- Offer prices
ALTER TABLE "Offer" 
ALTER COLUMN "totalDiscountGiven" TYPE DECIMAL(12,2) USING "totalDiscountGiven"::DECIMAL(12,2);

ALTER TABLE "OfferDiscountType" 
ALTER COLUMN "discountValue" TYPE DECIMAL(10,2) USING "discountValue"::DECIMAL(10,2);

ALTER TABLE "OfferDiscountType" 
ALTER COLUMN "minOrderValue" TYPE DECIMAL(12,2) USING COALESCE("minOrderValue", 0)::DECIMAL(12,2);

-- SalesTarget prices
ALTER TABLE "SalesTarget" 
ALTER COLUMN "goal" TYPE DECIMAL(12,2) USING "goal"::DECIMAL(12,2);

ALTER TABLE "SalesTarget" 
ALTER COLUMN "achieved" TYPE DECIMAL(12,2) USING "achieved"::DECIMAL(12,2);

-- Campaign revenue
ALTER TABLE "Campaign" 
ALTER COLUMN "revenue" TYPE DECIMAL(12,2) USING "revenue"::DECIMAL(12,2);

-- Clean up helper function
DROP FUNCTION IF EXISTS parse_price_string(TEXT);
