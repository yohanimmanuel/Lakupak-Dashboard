import { PrismaClient, ProductVariant } from '@/generated/prisma';
import { parsePrice } from '@/utils/currencyUtils';

const prisma = new PrismaClient();

export interface VariantValidationResult {
  isValid: boolean;
  variant?: ProductVariant;
  error?: string;
}

/**
 * Validate if a variant exists and is active for a product
 */
export const validateVariant = async (
  productId: string, 
  variantId?: number
): Promise<VariantValidationResult> => {
  try {
    // Get the product with its variants
    const product = await prisma.product.findFirst({
      where: { productId },
      include: { variants: true }
    });

    if (!product) {
      return {
        isValid: false,
        error: `Product not found: ${productId}`
      };
    }

    if (!product.variants || product.variants.length === 0) {
      return {
        isValid: false,
        error: `No variants found for product: ${productId}`
      };
    }

    // If no specific variant ID provided, use the first variant
    const targetVariant = variantId 
      ? product.variants.find(v => v.id === variantId)
      : product.variants[0];

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

    return {
      isValid: true,
      variant: targetVariant
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
export const getBestVariant = async (productId: string): Promise<ProductVariant> => {
  const validation = await validateVariant(productId);
  
  if (!validation.isValid || !validation.variant) {
    throw new Error(validation.error);
  }

  return validation.variant;
};

/**
 * Parse variant price using the existing currency utilities
 */
export const parseVariantPrice = (variant: ProductVariant, currency?: string): number => {
  return parsePrice(variant.sellingPrice, currency);
};

/**
 * Parse variant original price using the existing currency utilities
 */
export const parseVariantOriginalPrice = (variant: ProductVariant, currency?: string): number | null => {
  if (!variant.originalSellingPrice) {
    return null;
  }
  return parsePrice(variant.originalSellingPrice, currency);
};

/**
 * Check if variant has an active discount
 */
export const hasVariantDiscount = (variant: ProductVariant): boolean => {
  if (!variant.originalSellingPrice) {
    return false;
  }
  
  const currentPrice = parseVariantPrice(variant);
  const originalPrice = parseVariantOriginalPrice(variant);
  
  return originalPrice !== null && originalPrice > currentPrice;
};

/**
 * Calculate discount percentage for a variant
 */
export const calculateVariantDiscountPercentage = (variant: ProductVariant): number => {
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
