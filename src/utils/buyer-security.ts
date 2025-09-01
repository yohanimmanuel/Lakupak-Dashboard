import { NextResponse } from 'next/server';

// Security headers for buyer API endpoints
export const getSecurityHeaders = () => ({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private'
});

// Buyer input validation
export const validateBuyerInput = (data: any): { valid: boolean; error?: string } => {
  // For imports, we allow missing fields - only validate if provided
  // No required field validation - users can import partial data
  
  // Email format validation (flexible for imports)
  if (data.email && data.email.trim().length > 0) {
    // Basic email check - just ensure it has @ and .
    if (!data.email.includes('@') || !data.email.includes('.')) {
      return { valid: false, error: 'Invalid email format' };
    }
  }
  
  // Phone format validation (flexible for imports)
  if (data.phone && data.phone.trim().length > 0) {
    // Allow any phone format - just check if it's not empty and not too long
    if (data.phone.trim().length > 20) {
      return { valid: false, error: 'Phone number must be less than 20 characters' };
    }
  }
  
  // Length validations (only if fields exist)
  if (data.storeName && data.storeName.trim().length > 100) {
    return { valid: false, error: 'Store name must be less than 100 characters' };
  }
  
  if (data.owner && data.owner.trim().length > 100) {
    return { valid: false, error: 'Owner name must be less than 100 characters' };
  }
  
  if (data.email && data.email.trim().length > 254) {
    return { valid: false, error: 'Email must be less than 100 characters' };
  }
  

  
  if (data.businessType && data.businessType.trim().length > 100) {
    return { valid: false, error: 'Business type must be less than 100 characters' };
  }
  
  if (data.address && data.address.trim().length > 500) {
    return { valid: false, error: 'Address must be less than 500 characters' };
  }
  
  // Status validation
  const validStatuses = ['Active', 'Inactive', 'Blocked'];
  if (data.status && !validStatuses.includes(data.status)) {
    return { valid: false, error: 'Invalid status value' };
  }
  
  return { valid: true };
};

// Buyer update validation
export const validateBuyerUpdate = (data: any): { valid: boolean; error?: string } => {
  // Email format validation if provided
  if (data.email && data.email.trim().length > 0) {
    // Basic email check - just ensure it has @ and .
    if (!data.email.includes('@') || !data.email.includes('.')) {
      return { valid: false, error: 'Invalid email format' };
    }
    
    if (data.email.trim().length > 254) {
      return { valid: false, error: 'Email must be less than 254 characters' };
    }
  }
  
  // Phone format validation if provided
  if (data.phone && data.phone.trim().length > 0) {
    // Allow any phone format - just check length
    if (data.phone.trim().length > 20) {
      return { valid: false, error: 'Phone number must be less than 20 characters' };
    }
  }
  
  // Length validations for provided fields
  if (data.storeName !== undefined && data.storeName.trim().length > 100) {
    return { valid: false, error: 'Store name must be less than 100 characters' };
  }
  
  if (data.owner !== undefined && data.owner.trim().length > 100) {
    return { valid: false, error: 'Owner name must be less than 100 characters' };
  }
  
  if (data.businessType !== undefined && data.businessType.trim().length > 100) {
    return { valid: false, error: 'Business type must be less than 100 characters' };
  }
  
  if (data.address !== undefined && data.address.trim().length > 500) {
    return { valid: false, error: 'Address must be less than 500 characters' };
  }
  
  // Status validation if provided
  if (data.status !== undefined) {
    const validStatuses = ['Active', 'Inactive', 'Blocked'];
    if (!validStatuses.includes(data.status)) {
      return { valid: false, error: 'Invalid status value' };
    }
  }
  
  return { valid: true };
};

// Sanitize buyer data to prevent XSS and ensure proper types
export const sanitizeBuyerData = (data: any) => {
  const sanitized: any = {};
  
  // Basic string fields
  if (data.buyerId !== undefined) {
    sanitized.buyerId = String(data.buyerId).trim();
  }
  
  if (data.storeName !== undefined) {
    sanitized.storeName = String(data.storeName).trim();
  }
  
  if (data.owner !== undefined) {
    sanitized.owner = String(data.owner).trim();
  }
  
  if (data.email !== undefined) {
    sanitized.email = String(data.email).trim().toLowerCase();
  }
  
  if (data.phone !== undefined) {
    sanitized.phone = String(data.phone).trim();
  }
  
  if (data.businessType !== undefined) {
    sanitized.businessType = String(data.businessType).trim();
  }
  
  if (data.address !== undefined) {
    sanitized.address = String(data.address).trim();
  }
  
  if (data.status !== undefined) {
    sanitized.status = String(data.status).trim();
  }
  

  
  // Optional fields
  if (data.avatar !== undefined) {
    sanitized.avatar = data.avatar ? String(data.avatar).trim() : null;
  }
  
  if (data.logistics !== undefined) {
    sanitized.logistics = data.logistics ? String(data.logistics) : null;
  }
  
  if (data.notes !== undefined) {
    sanitized.notes = data.notes ? String(data.notes) : null;
  }
  
  if (data.orderDetails !== undefined) {
    sanitized.orderDetails = data.orderDetails ? String(data.orderDetails) : null;
  }
  
  // Numeric fields
  if (data.userId !== undefined) {
    sanitized.userId = Number(data.userId);
  }
  
  // Date fields
  if (data.createdAt !== undefined) {
    sanitized.createdAt = data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString();
  }
  
  return sanitized;
};

// Rate limiting for buyer operations (optional - can be enabled later)
export const buyerRateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many buyer operations from this IP, please try again later.'
};

// Validate buyer ID format
export const validateBuyerId = (buyerId: string): boolean => {
  // LKB- followed by 8 digits
  const buyerIdRegex = /^LKB-\d{8}$/;
  return buyerIdRegex.test(buyerId);
};

// Generate secure buyer ID
export const generateSecureBuyerId = (): string => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `LKB-${timestamp}${random}`;
};
