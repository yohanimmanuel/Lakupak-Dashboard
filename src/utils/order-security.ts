import { NextResponse } from 'next/server';

// Security headers for order API endpoints
export const getOrderSecurityHeaders = () => ({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
});

// Order input validation
export const validateOrderInput = (data: unknown): { valid: boolean; error?: string } => {
  // Type guard to ensure data is an object
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, error: 'Invalid data format' };
  }
  
  const orderData = data as Record<string, unknown>;
  
  // Required fields validation
  const requiredFields = [
    'orderId', 'buyerId', 'orderDate', 'orderStatus', 'paymentStatus',
    'deliveryMethod', 'subtotal', 'totalAmount', 'contactPerson',
    'storeName', 'contactPhone', 'deliveryAddress'
  ];
  
  for (const field of requiredFields) {
    if (!orderData[field] || String(orderData[field]).trim().length === 0) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }
  
  // Order ID format validation
  if (orderData.orderId && !validateOrderId(String(orderData.orderId))) {
    return { valid: false, error: 'Invalid order ID format. Must be LKO- followed by digits' };
  }
  
  // Buyer ID format validation
  if (orderData.buyerId && !validateBuyerId(String(orderData.buyerId))) {
    return { valid: false, error: 'Invalid buyer ID format. Must be LKB- followed by digits' };
  }
  
  // Email format validation
  if (orderData.customerEmail && String(orderData.customerEmail).trim().length > 0) {
    const email = String(orderData.customerEmail);
    if (!email.includes('@') || !email.includes('.')) {
      return { valid: false, error: 'Invalid email format' };
    }
    if (email.trim().length > 254) {
      return { valid: false, error: 'Email must be less than 254 characters' };
    }
  }
  
  // Phone format validation
  if (orderData.contactPhone && String(orderData.contactPhone).trim().length > 20) {
    return { valid: false, error: 'Phone number must be less than 20 characters' };
  }
  
  // Length validations
  if (orderData.contactPerson && String(orderData.contactPerson).trim().length > 100) {
    return { valid: false, error: 'Contact person name must be less than 100 characters' };
  }
  
  if (orderData.storeName && String(orderData.storeName).trim().length > 100) {
    return { valid: false, error: 'Store name must be less than 100 characters' };
  }
  
  if (orderData.deliveryAddress && String(orderData.deliveryAddress).trim().length > 500) {
    return { valid: false, error: 'Delivery address must be less than 500 characters' };
  }
  
  // Status validation
  const validOrderStatuses = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Returned'];
  if (orderData.orderStatus && !validOrderStatuses.includes(String(orderData.orderStatus))) {
    return { valid: false, error: 'Invalid order status' };
  }
  
  const validPaymentStatuses = ['Unpaid', 'Paid'];
  if (orderData.paymentStatus && !validPaymentStatuses.includes(String(orderData.paymentStatus))) {
    return { valid: false, error: 'Invalid payment status' };
  }
  
  const validDeliveryMethods = ['Distributor Fleet', '3rd-Party Courier', 'Pickup'];
  if (orderData.deliveryMethod && !validDeliveryMethods.includes(String(orderData.deliveryMethod))) {
    return { valid: false, error: 'Invalid delivery method' };
  }
  
  // Numeric validations
  if (orderData.subtotal !== undefined && (isNaN(Number(orderData.subtotal)) || Number(orderData.subtotal) < 0)) {
    return { valid: false, error: 'Subtotal must be a positive number' };
  }
  
  if (orderData.totalAmount !== undefined && (isNaN(Number(orderData.totalAmount)) || Number(orderData.totalAmount) < 0)) {
    return { valid: false, error: 'Total amount must be a positive number' };
  }
  
  if (orderData.discounts !== undefined && (isNaN(Number(orderData.discounts)) || Number(orderData.discounts) < 0)) {
    return { valid: false, error: 'Discounts must be a positive number' };
  }
  
  
  if (orderData.shippingFee !== undefined && (isNaN(Number(orderData.shippingFee)) || Number(orderData.shippingFee) < 0)) {
    return { valid: false, error: 'Shipping fee must be a positive number' };
  }
  
  // Order items validation
  if (orderData.orderItems) {
    try {
      const items = typeof orderData.orderItems === 'string' ? JSON.parse(orderData.orderItems) : orderData.orderItems;
      if (!Array.isArray(items)) {
        return { valid: false, error: 'Order items must be an array' };
      }
      
      for (const item of items) {
        if (!item.productId || !item.productName || !item.packageQuantity || !item.pricePerPackage || !item.subtotal) {
          return { valid: false, error: 'Order items must have productId, productName, packageQuantity, pricePerPackage, and subtotal' };
        }
        
        if (item.packageQuantity <= 0 || item.pricePerPackage <= 0 || item.subtotal <= 0) {
          return { valid: false, error: 'Order item package quantities and prices must be positive numbers' };
        }
      }
    } catch (error) {
      return { valid: false, error: 'Invalid order items JSON format' };
    }
  }
  
  return { valid: true };
};

// Order update validation
export const validateOrderUpdate = (data: unknown): { valid: boolean; error?: string } => {
  // Type guard to ensure data is an object
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, error: 'Invalid data format' };
  }
  
  const orderData = data as Record<string, unknown>;
  // For updates, we only validate fields that are provided
  
  // Order ID format validation if provided
  if (orderData.orderId && !validateOrderId(String(orderData.orderId))) {
    return { valid: false, error: 'Invalid order ID format. Must be LKO- followed by digits' };
  }
  
  // Buyer ID format validation if provided
  if (orderData.buyerId && !validateBuyerId(String(orderData.buyerId))) {
    return { valid: false, error: 'Invalid buyer ID format. Must be LKB- followed by digits' };
  }
  
  // Email format validation if provided
  if (orderData.customerEmail && String(orderData.customerEmail).trim().length > 0) {
    const email = String(orderData.customerEmail);
    if (!email.includes('@') || !email.includes('.')) {
      return { valid: false, error: 'Invalid email format' };
    }
    if (email.trim().length > 254) {
      return { valid: false, error: 'Email must be less than 254 characters' };
    }
  }
  
  // Phone format validation if provided
  if (orderData.contactPhone && String(orderData.contactPhone).trim().length > 20) {
    return { valid: false, error: 'Phone number must be less than 20 characters' };
  }
  
  // Length validations for provided fields
  if (orderData.contactPerson !== undefined && String(orderData.contactPerson).trim().length > 100) {
    return { valid: false, error: 'Contact person name must be less than 100 characters' };
  }
  
  if (orderData.storeName !== undefined && String(orderData.storeName).trim().length > 100) {
    return { valid: false, error: 'Store name must be less than 100 characters' };
  }
  
  if (orderData.deliveryAddress !== undefined && String(orderData.deliveryAddress).trim().length > 500) {
    return { valid: false, error: 'Delivery address must be less than 500 characters' };
  }
  
  // Status validation if provided
  if (orderData.orderStatus !== undefined) {
    const validOrderStatuses = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Returned'];
    if (!validOrderStatuses.includes(String(orderData.orderStatus))) {
      return { valid: false, error: 'Invalid order status' };
    }
  }
  
  if (orderData.paymentStatus !== undefined) {
    const validPaymentStatuses = ['Unpaid', 'Paid'];
    if (!validPaymentStatuses.includes(String(orderData.paymentStatus))) {
      return { valid: false, error: 'Invalid payment status' };
    }
  }
  
  if (orderData.deliveryMethod !== undefined) {
    const validDeliveryMethods = ['Distributor Fleet', '3rd-Party Courier', 'Pickup'];
    if (!validDeliveryMethods.includes(String(orderData.deliveryMethod))) {
      return { valid: false, error: 'Invalid delivery method' };
    }
  }
  
  // Numeric validations for provided fields
  if (orderData.subtotal !== undefined && (isNaN(Number(orderData.subtotal)) || Number(orderData.subtotal) < 0)) {
    return { valid: false, error: 'Subtotal must be a positive number' };
  }
  
  if (orderData.totalAmount !== undefined && (isNaN(Number(orderData.totalAmount)) || Number(orderData.totalAmount) < 0)) {
    return { valid: false, error: 'Total amount must be a positive number' };
  }
  
  if (orderData.discounts !== undefined && (isNaN(Number(orderData.discounts)) || Number(orderData.discounts) < 0)) {
    return { valid: false, error: 'Discounts must be a positive number' };
  }
  
  
  if (orderData.shippingFee !== undefined && (isNaN(Number(orderData.shippingFee)) || Number(orderData.shippingFee) < 0)) {
    return { valid: false, error: 'Shipping fee must be a positive number' };
  }
  
  // Order items validation if provided
  if (orderData.orderItems) {
    try {
      const items = typeof orderData.orderItems === 'string' ? JSON.parse(orderData.orderItems) : orderData.orderItems;
      if (!Array.isArray(items)) {
        return { valid: false, error: 'Order items must be an array' };
      }
      
      for (const item of items) {
        if (!item.productId || !item.productName || !item.packageQuantity || !item.pricePerPackage || !item.subtotal) {
          return { valid: false, error: 'Order items must have productId, productName, packageQuantity, pricePerPackage, and subtotal' };
        }
        
        if (item.packageQuantity <= 0 || item.pricePerPackage <= 0 || item.subtotal <= 0) {
          return { valid: false, error: 'Order item package quantities and prices must be positive numbers' };
        }
      }
    } catch (error) {
      return { valid: false, error: 'Invalid order items JSON format' };
    }
  }
  
  return { valid: true };
};

// Sanitize order data to prevent XSS and ensure proper types
export const sanitizeOrderData = (data: unknown) => {
  // Type guard to ensure data is an object
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }
  
  const orderData = data as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  
  // Basic string fields
  if (orderData.orderId !== undefined) {
    sanitized.orderId = String(orderData.orderId).trim();
  }
  
  if (orderData.buyerId !== undefined) {
    sanitized.buyerId = String(orderData.buyerId).trim();
  }
  
  if (orderData.orderStatus !== undefined) {
    sanitized.orderStatus = String(orderData.orderStatus).trim();
  }
  
  if (orderData.paymentStatus !== undefined) {
    sanitized.paymentStatus = String(orderData.paymentStatus).trim();
  }
  
  if (orderData.deliveryMethod !== undefined) {
    sanitized.deliveryMethod = String(orderData.deliveryMethod).trim();
  }
  
  if (orderData.paymentTerms !== undefined) {
    sanitized.paymentTerms = String(orderData.paymentTerms).trim();
  }
  
  if (orderData.currency !== undefined) {
    sanitized.currency = String(orderData.currency).trim();
  }
  
  if (orderData.contactPerson !== undefined) {
    sanitized.contactPerson = String(orderData.contactPerson).trim();
  }
  
  if (orderData.storeName !== undefined) {
    sanitized.storeName = String(orderData.storeName).trim();
  }
  
  if (orderData.contactPhone !== undefined) {
    sanitized.contactPhone = String(orderData.contactPhone).trim();
  }
  
  if (orderData.customerEmail !== undefined) {
    sanitized.customerEmail = orderData.customerEmail ? String(orderData.customerEmail).trim().toLowerCase() : null;
  }
  
  if (orderData.deliveryAddress !== undefined) {
    sanitized.deliveryAddress = String(orderData.deliveryAddress).trim();
  }
  
  if (orderData.preferredDeliveryTime !== undefined) {
    sanitized.preferredDeliveryTime = orderData.preferredDeliveryTime ? String(orderData.preferredDeliveryTime).trim() : null;
  }
  
  if (orderData.assignedLogistics !== undefined) {
    sanitized.assignedLogistics = orderData.assignedLogistics ? String(orderData.assignedLogistics).trim() : null;
  }
  
  if (orderData.trackingNumber !== undefined) {
    sanitized.trackingNumber = orderData.trackingNumber ? String(orderData.trackingNumber).trim() : null;
  }
  
  if (orderData.deliveryNote !== undefined) {
    sanitized.deliveryNote = orderData.deliveryNote ? String(orderData.deliveryNote).trim() : null;
  }
  
  if (orderData.deliveryConfirmation !== undefined) {
    sanitized.deliveryConfirmation = orderData.deliveryConfirmation ? String(orderData.deliveryConfirmation).trim() : null;
  }
  
  if (orderData.pod !== undefined) {
    sanitized.pod = orderData.pod ? String(orderData.pod).trim() : null;
  }
  
  if (orderData.acceptedBy !== undefined) {
    sanitized.acceptedBy = orderData.acceptedBy ? String(orderData.acceptedBy).trim() : null;
  }
  
  // Numeric fields
  if (orderData.subtotal !== undefined) {
    sanitized.subtotal = parseFloat(String(orderData.subtotal)) || 0;
  }
  
  if (orderData.discounts !== undefined) {
    sanitized.discounts = parseFloat(String(orderData.discounts)) || 0;
  }
  
  
  if (orderData.shippingFee !== undefined) {
    sanitized.shippingFee = parseFloat(String(orderData.shippingFee)) || 0;
  }
  
  if (orderData.totalAmount !== undefined) {
    sanitized.totalAmount = parseFloat(String(orderData.totalAmount)) || 0;
  }
  
  if (orderData.totalOrders !== undefined) {
    sanitized.totalOrders = parseInt(String(orderData.totalOrders)) || 0;
  }
  
  if (orderData.userId !== undefined) {
    sanitized.userId = Number(orderData.userId);
  }
  
  // Date fields
  if (orderData.orderDate !== undefined) {
    sanitized.orderDate = orderData.orderDate ? new Date(String(orderData.orderDate)) : new Date();
  }
  
  if (orderData.acceptedAt !== undefined) {
    sanitized.acceptedAt = orderData.acceptedAt ? new Date(String(orderData.acceptedAt)) : null;
  }
  
  // Order items (keep as JSON string)
  if (orderData.orderItems !== undefined) {
    sanitized.orderItems = typeof orderData.orderItems === 'string' ? orderData.orderItems : JSON.stringify(orderData.orderItems);
  }
  
  return sanitized;
};

// Rate limiting for order operations
export const orderRateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many order operations from this IP, please try again later.'
};

// Validate order ID format
export const validateOrderId = (orderId: string): boolean => {
  // LKO- followed by digits (allowing variable length)
  const orderIdRegex = /^LKO-\d+$/;
  return orderIdRegex.test(orderId);
};

// Validate buyer ID format
export const validateBuyerId = (buyerId: string): boolean => {
  // LKB- followed by digits (allowing variable length)
  const buyerIdRegex = /^LKB-\d+$/;
  return buyerIdRegex.test(buyerId);
};

// Generate secure order ID
export const generateSecureOrderId = (): string => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `LKO-${timestamp}${random}`;
};

// Validate user access to order (for multi-tenant security)
export const validateOrderAccess = (order: Record<string, unknown>, userId: number): boolean => {
  return order.userId === userId;
};
