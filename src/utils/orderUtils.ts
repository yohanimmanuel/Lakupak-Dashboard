import { Order, OrderItem } from '@/types/order';
import { parsePrice } from '@/utils/currencyUtils';
import { recalculateEntireOrder } from './orderCalculations';

import { prisma } from '@/lib/db';
import { selectVariantOption, getUnitPriceFromVariantOption } from '@/domain/marketplace/orderItemRules';

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
      include: { variantOptions: true, variants: true }
    });
    
    if (!product) {
      throw new Error(`Product not found: ${item.productId}`);
    }
    
    const variant = selectVariantOption(product, {
      variantOptionId: item.variantOptionId ?? null,
      variantId: item.variantId ?? null,
    });
    if (!variant) {
      throw new Error(`No variants with pricing found for product: ${item.productId}`);
    }
    
    const consistentUnitPrice = getUnitPriceFromVariantOption(variant);
    if (consistentUnitPrice <= 0) {
      throw new Error(`No variants with pricing found for product: ${item.productId}`);
    }
    
    // Get package info from item (piece-based system)
    const piecesPerPackage = item.piecesPerPackage || 1;
    const packageType = item.packageType || 'Piece';
    const packageQuantity = item.packageQuantity || 1;
    const pricePerPackage = consistentUnitPrice * piecesPerPackage;
    const consistentSubtotal = packageQuantity * pricePerPackage;
    
    return {
      ...item,
      variantOptionId: item.variantOptionId ?? variant.id,
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

// Re-export pure calculation functions from orderCalculations for backward compatibility
export {
  recalculateOrderItem,
  recalculateOrderItems,
  calculateOrderSubtotal,
  validateAndCorrectOrder,
  calculateOrderTotalAmount,
  calculateOrderTotalQuantity,
  validateOrderItem,
  validateOrderCalculations,
  recalculateEntireOrder,
  updateOrderItem,
  updateOrderItemPricePerPackage,
  updateOrderItemPackageQuantity,
} from './orderCalculations';

// Ensure price consistency for all order items
export const ensureAllPriceConsistency = async (orderItems: OrderItem[]): Promise<OrderItem[]> => {
  const consistentItems = await Promise.all(
    orderItems.map(item => ensurePriceConsistency(item))
  );
  return consistentItems;
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

