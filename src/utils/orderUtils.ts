import { Order, OrderItem } from '@/types/order';
import { PrismaClient } from '@/generated/prisma';
import { parsePrice } from '@/utils/currencyUtils';

const prisma = new PrismaClient();

// ===== CALCULATION FUNCTIONS =====


// Ensure price consistency by fetching product's sellingPrice and package info
export const ensurePriceConsistency = async (item: OrderItem): Promise<OrderItem> => {
  try {
    // Skip if productId is null
    if (!item.productId) {
      return item;
    }
    
    const product = await prisma.product.findFirst({
      where: { productId: item.productId },
      include: { variants: true }
    });
    
    if (!product) {
      throw new Error(`Product not found: ${item.productId}`);
    }
    
    // Get the first variant (or specified variant)
    const variant = item.variantId 
      ? product.variants.find(v => v.id === item.variantId) || product.variants[0]
      : product.variants[0];
    
    if (!variant) {
      throw new Error(`No variants found for product: ${item.productId}`);
    }
    
    // Use the centralized price parsing utility for consistency
    const consistentUnitPrice = parsePrice(variant.sellingPrice);
    
    // Get package info from item (piece-based system)
    const piecesPerPackage = item.piecesPerPackage || 1;
    const packageType = item.packageType || 'Piece';
    const packageQuantity = item.packageQuantity || 1;
    const pricePerPackage = consistentUnitPrice * piecesPerPackage;
    const consistentSubtotal = packageQuantity * pricePerPackage;
    
    return {
      ...item,
      packageType: packageType,
      piecesPerPackage: piecesPerPackage,
      packageQuantity: packageQuantity,
      pricePerPackage: pricePerPackage,
      subtotal: consistentSubtotal
    };
  } catch (error) {
    // If product not found, return original item
    return item;
  }
};

// Recalculate order item subtotal (package-based)
export const recalculateOrderItem = (item: OrderItem): OrderItem => {
  // Package-based pricing: calculate based on package quantity and price per package
  const newSubtotal = (item.packageQuantity || 1) * (item.pricePerPackage || 0);
  return {
    ...item,
    subtotal: newSubtotal
  };
};

// Recalculate all order items and their subtotals
export const recalculateOrderItems = (orderItems: OrderItem[]): OrderItem[] => {
  return orderItems.map(item => recalculateOrderItem(item));
};

// Ensure price consistency for all order items
export const ensureAllPriceConsistency = async (orderItems: OrderItem[]): Promise<OrderItem[]> => {
  const consistentItems = await Promise.all(
    orderItems.map(item => ensurePriceConsistency(item))
  );
  return consistentItems;
};

// Calculate subtotal from order items (with validation)
export const calculateOrderSubtotal = (order: Order): number => {
  return order.orderItems.reduce((sum, item) => {
    // Validate that item.subtotal = item.packageQuantity × item.pricePerPackage
    const expectedSubtotal = (item.packageQuantity || 1) * (item.pricePerPackage || 0);
    if (Math.abs(item.subtotal - expectedSubtotal) > 0.01) {
    }
    return sum + item.subtotal;
  }, 0);
};

// Validate and auto-correct order data (ensures mathematical consistency)
export const validateAndCorrectOrder = (order: Order): { order: Order; wasCorrected: boolean } => {
  let wasCorrected = false;
  let correctedOrder = { ...order };

  // 1. Validate and correct each order item
  const correctedItems = order.orderItems.map(item => {
    const expectedSubtotal = (item.packageQuantity || 1) * (item.pricePerPackage || 0);
    if (Math.abs(item.subtotal - expectedSubtotal) > 0.01) {
      wasCorrected = true;
      return { ...item, subtotal: expectedSubtotal };
    }
    return item;
  });

  // 2. Calculate correct values
  const correctSubtotal = correctedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const correctTotalAmount = correctSubtotal + order.shippingFee - order.discounts;
  const correctTotalQuantity = correctedItems.reduce((sum, item) => {
    const piecesPerPackage = item.piecesPerPackage || 1;
    const packageQuantity = item.packageQuantity || 1;
    return sum + (packageQuantity * piecesPerPackage);
  }, 0);

  // 3. Check if order-level calculations need correction
  if (Math.abs(order.subtotal - correctSubtotal) > 0.01) {
    wasCorrected = true;
    correctedOrder.subtotal = correctSubtotal;
  }

  if (Math.abs(order.totalAmount - correctTotalAmount) > 0.01) {
    wasCorrected = true;
    correctedOrder.totalAmount = correctTotalAmount;
  }

  if (order.totalOrders !== correctTotalQuantity) {
    wasCorrected = true;
    correctedOrder.totalOrders = correctTotalQuantity;
  }

  // 4. Update order items if corrected
  if (wasCorrected) {
    correctedOrder.orderItems = correctedItems;
  }

  return { order: correctedOrder, wasCorrected };
};

// Calculate total amount from order items (same logic as OrderDetails)
export const calculateOrderTotalAmount = (order: Order): number => {
  const subtotal = calculateOrderSubtotal(order);
  return subtotal + order.shippingFee - order.discounts;
};

// Calculate total quantity from order items (total pieces)
export const calculateOrderTotalQuantity = (order: Order): number => {
  return order.orderItems.reduce((sum, item) => {
    const piecesPerPackage = item.piecesPerPackage || 1;
    const packageQuantity = item.packageQuantity || 1;
    return sum + (packageQuantity * piecesPerPackage);
  }, 0);
};

// ===== VALIDATION FUNCTIONS =====

// Validate order item calculations
export const validateOrderItem = (item: OrderItem): { valid: boolean; error?: string } => {
  const expectedSubtotal = (item.packageQuantity || 1) * (item.pricePerPackage || 0);
  if (Math.abs(item.subtotal - expectedSubtotal) > 0.01) {
    return { 
      valid: false, 
      error: `OrderItem subtotal mismatch: expected ${expectedSubtotal}, got ${item.subtotal}` 
    };
  }
  return { valid: true };
};

// Validate entire order calculations
export const validateOrderCalculations = (order: Order): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  // Validate each order item
  order.orderItems.forEach((item, index) => {
    const validation = validateOrderItem(item);
    if (!validation.valid) {
      errors.push(`Item ${index + 1}: ${validation.error}`);
    }
  });
  
  // Validate order subtotal
  const calculatedSubtotal = calculateOrderSubtotal(order);
  if (Math.abs(order.subtotal - calculatedSubtotal) > 0.01) {
    errors.push(`Order subtotal mismatch: expected ${calculatedSubtotal}, got ${order.subtotal}`);
  }
  
  // Validate order total amount
  const calculatedTotal = calculateOrderTotalAmount(order);
  if (Math.abs(order.totalAmount - calculatedTotal) > 0.01) {
    errors.push(`Order total amount mismatch: expected ${calculatedTotal}, got ${order.totalAmount}`);
  }
  
  // Validate order quantity (total pieces)
  const calculatedQuantity = calculateOrderTotalQuantity(order);
  if (order.totalOrders !== calculatedQuantity) {
    errors.push(`Order quantity mismatch: expected ${calculatedQuantity}, got ${order.totalOrders}`);
  }
  
  return { valid: errors.length === 0, errors };
};

// ===== RECALCULATION FUNCTIONS =====

// Comprehensive order recalculation - updates ALL calculated fields
export const recalculateEntireOrder = (order: Order): Order => {
  // 1. Recalculate all order items
  const recalculatedItems = recalculateOrderItems(order.orderItems);
  
  // 2. Calculate new subtotal
  const newSubtotal = recalculatedItems.reduce((sum, item) => sum + item.subtotal, 0);
  
  // 3. Calculate new total amount
  const newTotalAmount = newSubtotal + order.shippingFee - order.discounts;
  
  // 4. Calculate new total quantity (total pieces)
  const newTotalQuantity = recalculatedItems.reduce((sum, item) => {
    const piecesPerPackage = item.piecesPerPackage || 1;
    const packageQuantity = item.packageQuantity || 1;
    return sum + (packageQuantity * piecesPerPackage);
  }, 0);
  
  // 5. Return updated order with all recalculated values
  return {
    ...order,
    orderItems: recalculatedItems,
    subtotal: newSubtotal,
    totalAmount: newTotalAmount,
    totalOrders: newTotalQuantity
  };
};

// ===== UPDATE FUNCTIONS =====

// Update a specific order item and recalculate everything
export const updateOrderItem = (
  order: Order, 
  itemIndex: number, 
  updates: Partial<OrderItem>
): Order => {
  const updatedItems = [...order.orderItems];
  updatedItems[itemIndex] = { ...updatedItems[itemIndex], ...updates };
  
  const orderWithUpdatedItems = {
    ...order,
    orderItems: updatedItems
  };
  
  // Recalculate everything
  return recalculateEntireOrder(orderWithUpdatedItems);
};

// Update order item price per package and recalculate
export const updateOrderItemPricePerPackage = (
  order: Order, 
  itemIndex: number, 
  newPricePerPackage: number
): Order => {
  return updateOrderItem(order, itemIndex, { pricePerPackage: newPricePerPackage });
};

// Update order item package quantity and recalculate
export const updateOrderItemPackageQuantity = (
  order: Order, 
  itemIndex: number, 
  newPackageQuantity: number
): Order => {
  return updateOrderItem(order, itemIndex, { packageQuantity: newPackageQuantity });
};

// ===== DATABASE FUNCTIONS =====

// Save updated order to database
export const saveUpdatedOrder = async (updatedOrder: Order): Promise<Order> => {
  const response = await fetch('/api/orders', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      orderId: updatedOrder.orderId,
      orderItems: updatedOrder.orderItems,
      // Include other fields that might have changed
      subtotal: updatedOrder.subtotal,
      totalAmount: updatedOrder.totalAmount,
      totalOrders: updatedOrder.totalOrders
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to update order');
  }

  return response.json();
};

// Recalculate and update database after manual JSON changes
export const recalculateAndUpdateDatabase = async (order: Order): Promise<Order> => {
  // Recalculate everything based on current orderItems
  const recalculatedOrder = recalculateEntireOrder(order);
  
  // Save the recalculated values to database
  return await saveUpdatedOrder(recalculatedOrder);
};

// Force database recalculation for a specific order
export const forceDatabaseRecalculation = async (orderId: string): Promise<Order> => {
  // 1. Fetch the current order from the database
  const fetchResponse = await fetch(`/api/orders?id=${orderId}`);
  if (!fetchResponse.ok) {
    throw new Error('Failed to fetch order for recalculation');
  }
  const currentOrder: Order = await fetchResponse.json();

  // 2. Ensure orderItems are parsed if they are stored as a JSON string
  let parsedOrderItems: OrderItem[] = [];
  if (typeof currentOrder.orderItems === 'string') {
    try {
      parsedOrderItems = JSON.parse(currentOrder.orderItems);
    } catch (e) {
      throw new Error('Invalid orderItems data in database');
    }
  } else if (Array.isArray(currentOrder.orderItems)) {
    parsedOrderItems = currentOrder.orderItems;
  }

  // 3. Recalculate the entire order based on the fetched (and potentially manually edited) orderItems
  const orderToRecalculate: Order = {
    ...currentOrder,
    orderItems: parsedOrderItems, // Use the parsed order items for recalculation
  };
  const recalculatedOrder = recalculateEntireOrder(orderToRecalculate);

  // 4. Send the fully recalculated order back to the API for update
  const updateResponse = await fetch('/api/orders', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      orderId: recalculatedOrder.orderId,
      orderItems: recalculatedOrder.orderItems, // Send the recalculated order items
      subtotal: recalculatedOrder.subtotal,
      totalAmount: recalculatedOrder.totalAmount,
      totalOrders: recalculatedOrder.totalOrders,
      // Include other fields that might affect totalAmount
      shippingFee: recalculatedOrder.shippingFee,
      discounts: recalculatedOrder.discounts,
      // Include other fields that might be necessary for a complete update
      orderStatus: recalculatedOrder.orderStatus,
      paymentStatus: recalculatedOrder.paymentStatus,
      deliveryMethod: recalculatedOrder.deliveryMethod,
      trackingNumber: recalculatedOrder.trackingNumber,
      contactPerson: recalculatedOrder.contactPerson,
      orderDate: recalculatedOrder.orderDate,
      acceptedAt: recalculatedOrder.acceptedAt,
    }),
  });

  if (!updateResponse.ok) {
    throw new Error('Failed to force database recalculation update');
  }

  return updateResponse.json();
};

// Test function to verify the system works correctly
export const testOrderCalculation = (order: Order): void => {
  
  const { order: correctedOrder, wasCorrected } = validateAndCorrectOrder(order);
};
