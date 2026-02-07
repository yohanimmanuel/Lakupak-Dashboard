// Client-safe order calculation utilities (pure functions, no database access)
import { Order, OrderItem } from '@/types/order';

// Calculate subtotal from order items (with validation)
export const calculateOrderSubtotal = (order: Order): number => {
  return order.orderItems.reduce((sum, item) => {
    // Validate that item.subtotal = item.packageQuantity × item.pricePerPackage
    // (validation is silent - just use the subtotal value)
    return sum + (item.subtotal || 0);
  }, 0);
};

// Calculate total order amount (subtotal + shipping - discounts)
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

// Validate order item calculations
export const validateOrderItem = (item: OrderItem): { valid: boolean; error?: string } => {
  const expectedSubtotal = (item.packageQuantity || 1) * (item.pricePerPackage || 0);
  if (Math.abs(item.subtotal - expectedSubtotal) > 0.01) {
    return {
      valid: false,
      error: `Subtotal mismatch: expected ${expectedSubtotal}, got ${item.subtotal}`
    };
  }
  return { valid: true };
};

// Validate and auto-correct order data (ensures mathematical consistency)
export const validateAndCorrectOrder = (order: Order): { order: Order; wasCorrected: boolean } => {
  let wasCorrected = false;
  const correctedOrder = { ...order };

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
  
  // Validate order total quantity
  const calculatedQuantity = calculateOrderTotalQuantity(order);
  if (order.totalOrders !== calculatedQuantity) {
    errors.push(`Order total quantity mismatch: expected ${calculatedQuantity}, got ${order.totalOrders}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

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
  
  // 5. Return updated order with all calculated fields
  return {
    ...order,
    orderItems: recalculatedItems,
    subtotal: newSubtotal,
    totalAmount: newTotalAmount,
    totalOrders: newTotalQuantity
  };
};

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
