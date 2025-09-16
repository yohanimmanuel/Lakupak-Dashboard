/**
 * Shipping fee calculation utilities for radius-based pricing
 * Handles distributor shipping fee configuration and calculation
 */

export interface ShippingConfig {
  baseShippingRadius: number;      // Base radius in km (e.g., 50km)
  baseShippingPrice: number;       // Price for base radius
  additionalPricePerKm: number;    // Price per km beyond base radius
  maxShippingRadius: number;       // Maximum delivery distance in km
  freeShippingThreshold: number;   // Order value for free shipping
}

export interface ShippingCalculationResult {
  shippingFee: number;
  isFreeShipping: boolean;
  isWithinMaxRadius: boolean;
  calculation: {
    basePrice: number;
    additionalDistance: number;
    additionalCost: number;
    totalFee: number;
  };
}

/**
 * Calculate shipping fee based on distance and configuration
 */
export function calculateShippingFee(
  distance: number, // Distance in km
  orderValue: number, // Order subtotal
  config: ShippingConfig
): ShippingCalculationResult {
  // Check if order qualifies for free shipping
  const isFreeShipping = orderValue >= config.freeShippingThreshold;
  
  if (isFreeShipping) {
    return {
      shippingFee: 0,
      isFreeShipping: true,
      isWithinMaxRadius: distance <= config.maxShippingRadius,
      calculation: {
        basePrice: 0,
        additionalDistance: 0,
        additionalCost: 0,
        totalFee: 0,
      },
    };
  }

  // Check if distance exceeds maximum delivery radius
  const isWithinMaxRadius = distance <= config.maxShippingRadius;
  
  if (!isWithinMaxRadius) {
    // Return a high fee or error for distances beyond max radius
    return {
      shippingFee: config.baseShippingPrice + (config.additionalPricePerKm * 1000), // Very high fee
      isFreeShipping: false,
      isWithinMaxRadius: false,
      calculation: {
        basePrice: config.baseShippingPrice,
        additionalDistance: distance - config.baseShippingRadius,
        additionalCost: config.additionalPricePerKm * (distance - config.baseShippingRadius),
        totalFee: config.baseShippingPrice + (config.additionalPricePerKm * (distance - config.baseShippingRadius)),
      },
    };
  }

  // Calculate base price
  const basePrice = config.baseShippingPrice;
  
  // Calculate additional distance and cost
  const additionalDistance = Math.max(0, distance - config.baseShippingRadius);
  const additionalCost = additionalDistance * config.additionalPricePerKm;
  
  // Calculate total shipping fee
  const totalFee = basePrice + additionalCost;

  return {
    shippingFee: totalFee,
    isFreeShipping: false,
    isWithinMaxRadius: true,
    calculation: {
      basePrice,
      additionalDistance,
      additionalCost,
      totalFee,
    },
  };
}

/**
 * Get default shipping configuration
 */
export function getDefaultShippingConfig(): ShippingConfig {
  return {
    baseShippingRadius: 50,
    baseShippingPrice: 15000,
    additionalPricePerKm: 500,
    maxShippingRadius: 200,
    freeShippingThreshold: 100000,
  };
}

/**
 * Validate shipping configuration
 */
export function validateShippingConfig(config: Partial<ShippingConfig>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.baseShippingRadius !== undefined && config.baseShippingRadius < 0) {
    errors.push('Base shipping radius must be positive');
  }

  if (config.baseShippingPrice !== undefined && config.baseShippingPrice < 0) {
    errors.push('Base shipping price must be positive');
  }

  if (config.additionalPricePerKm !== undefined && config.additionalPricePerKm < 0) {
    errors.push('Additional price per km must be positive');
  }

  if (config.maxShippingRadius !== undefined && config.maxShippingRadius < 0) {
    errors.push('Maximum shipping radius must be positive');
  }

  if (config.freeShippingThreshold !== undefined && config.freeShippingThreshold < 0) {
    errors.push('Free shipping threshold must be positive');
  }

  if (config.baseShippingRadius !== undefined && config.maxShippingRadius !== undefined && 
      config.baseShippingRadius > config.maxShippingRadius) {
    errors.push('Base shipping radius cannot be greater than maximum shipping radius');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Format shipping fee for display
 */
export function formatShippingFee(fee: number, currency: string = 'IDR'): string {
  if (fee === 0) {
    return 'Free Shipping';
  }
  
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(fee);
}

/**
 * Get shipping fee suggestions based on distance
 */
export function getShippingFeeSuggestions(
  distance: number,
  config: ShippingConfig
): { distance: number; fee: number; isFree: boolean }[] {
  const suggestions: { distance: number; fee: number; isFree: boolean }[] = [];
  
  // Add current distance
  const currentResult = calculateShippingFee(distance, 0, config);
  suggestions.push({
    distance,
    fee: currentResult.shippingFee,
    isFree: currentResult.isFreeShipping,
  });
  
  // Add common distance points
  const commonDistances = [10, 25, 50, 75, 100, 150, 200];
  for (const dist of commonDistances) {
    if (dist !== distance && dist <= config.maxShippingRadius) {
      const result = calculateShippingFee(dist, 0, config);
      suggestions.push({
        distance: dist,
        fee: result.shippingFee,
        isFree: result.isFreeShipping,
      });
    }
  }
  
  // Remove duplicates and sort by distance
  const uniqueSuggestions = suggestions.filter((suggestion, index, self) => 
    index === self.findIndex(s => s.distance === suggestion.distance)
  );
  
  return uniqueSuggestions.sort((a, b) => a.distance - b.distance);
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * This is a placeholder - in production, you'd use a proper geocoding service
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  return Math.round(distance * 100) / 100; // Round to 2 decimal places
}

/**
 * Get shipping fee breakdown for display
 */
export function getShippingFeeBreakdown(
  distance: number,
  orderValue: number,
  config: ShippingConfig
): {
  baseRadius: number;
  basePrice: number;
  additionalDistance: number;
  additionalCost: number;
  totalFee: number;
  isFreeShipping: boolean;
  isWithinMaxRadius: boolean;
} {
  const result = calculateShippingFee(distance, orderValue, config);
  
  return {
    baseRadius: config.baseShippingRadius,
    basePrice: result.calculation.basePrice,
    additionalDistance: result.calculation.additionalDistance,
    additionalCost: result.calculation.additionalCost,
    totalFee: result.shippingFee,
    isFreeShipping: result.isFreeShipping,
    isWithinMaxRadius: result.isWithinMaxRadius,
  };
}
