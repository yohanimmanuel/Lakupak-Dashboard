import type { VariantOption } from '@/lib/db';
import { parsePrice } from '@/utils/currencyUtils';
import { VariantOption as VariantOptionType } from '@/types/product';

import { prisma } from '@/lib/db';

export interface VariantValidationResult {
  isValid: boolean;
  variant?: VariantOptionType | { sellingPrice: string; moq?: number; variantName?: string; isActive?: boolean };
  error?: string;
}

/**
 * Validate if a variant exists and is active for a product
 * Also validates MOQ (Minimum Order Quantity) for ALL variants
 */
export const validateVariant = async (
  productId: string, 
  variantId?: number,
  orderQuantity?: number,
  packageQuantity?: number
): Promise<VariantValidationResult> => {
  try {
    // Get the product with its variant options (new structure)
    const product = await prisma.product.findFirst({
      where: { productId },
      include: { variantOptions: true, variants: true }
    });

    if (!product) {
      return {
        isValid: false,
        error: `Product not found: ${productId}`
      };
    }

    // Prioritize variantOptions (new structure) over legacy variants
    let targetVariant: VariantOption | null = null;
    
    if (variantId) {
      targetVariant = product.variantOptions.find(v => v.id === variantId) || null;
    } else {
      // Get first active variant, or first default variant, or just first variant
      targetVariant = product.variantOptions.find(v => v.isActive && v.isDefault) 
        || product.variantOptions.find(v => v.isActive)
        || product.variantOptions[0] 
        || null;
    }

    if (!targetVariant) {
      return {
        isValid: false,
        error: variantId 
          ? `Variant ${variantId} not found for product: ${productId}`
          : `No active variants found for product: ${productId}`
      };
    }

    if (!targetVariant.isActive) {
      return {
        isValid: false,
        error: `Variant ${targetVariant.variantName} is not active`
      };
    }

    // Validate MOQ for the specific variant (if MOQ is set)
    // MOQ is now in pieces (piece-based system)
    if (targetVariant.moq && orderQuantity !== undefined) {
      if (orderQuantity < targetVariant.moq) {
        return {
          isValid: false,
          error: `Minimum order quantity for ${targetVariant.variantName} is ${targetVariant.moq} pieces. You ordered ${orderQuantity} pieces.`
        };
      }
    }

    // Convert Decimal sellingPrice to number for the return value
    const { parsePrice } = await import('@/utils/currencyUtils');
    const sellingPriceNum = parsePrice(targetVariant.sellingPrice as unknown);
    
    return {
      isValid: true,
      variant: {
        sellingPrice: String(sellingPriceNum), // Convert to string to match expected type
        moq: targetVariant.moq || undefined,
        variantName: targetVariant.variantName,
        isActive: targetVariant.isActive
      }
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Failed to validate variant: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

/**
 * Get the best available variant for a product (prioritizes default, then first active)
 */
export const getBestVariant = async (productId: string): Promise<{ sellingPrice: string; moq?: number; variantName?: string; isActive?: boolean }> => {
  const validation = await validateVariant(productId);
  
  if (!validation.isValid || !validation.variant) {
    throw new Error(validation.error);
  }

  return validation.variant;
};

/**
 * Parse variant price using the existing currency utilities
 */
export const parseVariantPrice = (variant: { sellingPrice: string } | VariantOptionType, currency?: string): number => {
  const sellingPrice = typeof variant === 'object' && 'sellingPrice' in variant 
    ? variant.sellingPrice 
    : (variant as { sellingPrice: string }).sellingPrice;
  return parsePrice(sellingPrice, currency);
};

/**
 * Parse variant original price using the existing currency utilities
 */
export const parseVariantOriginalPrice = (variant: { originalSellingPrice?: string | null } | VariantOptionType, currency?: string): number | null => {
  const originalPrice = typeof variant === 'object' && 'originalSellingPrice' in variant
    ? variant.originalSellingPrice
    : (variant as { originalSellingPrice?: string | null }).originalSellingPrice;
    
  if (!originalPrice || originalPrice === '') {
    return null;
  }
  return parsePrice(originalPrice, currency);
};

/**
 * Check if variant has an active discount
 */
export const hasVariantDiscount = (variant: { sellingPrice: string; originalSellingPrice?: string | null } | VariantOptionType): boolean => {
  const originalPrice = parseVariantOriginalPrice(variant);
  if (originalPrice === null) {
    return false;
  }
  
  const currentPrice = parseVariantPrice(variant);
  
  return originalPrice > currentPrice;
};

/**
 * Calculate discount percentage for a variant
 */
export const calculateVariantDiscountPercentage = (variant: { sellingPrice: string; originalSellingPrice?: string | null } | VariantOptionType): number => {
  if (!hasVariantDiscount(variant)) {
    return 0;
  }
  
  const currentPrice = parseVariantPrice(variant);
  const originalPrice = parseVariantOriginalPrice(variant);
  
  if (!originalPrice || originalPrice === 0) {
    return 0;
  }
  
  return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
};
