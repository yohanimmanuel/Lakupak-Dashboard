// Production-ready authentication security utilities
import { NextRequest } from 'next/server';

// Rate limiting for authentication endpoints
interface RateLimitStore {
  attempts: number;
  lastAttempt: number;
  blockedUntil?: number;
}

const rateLimitStore = new Map<string, RateLimitStore>();

export const authRateLimit = {
  // Check if IP/email is rate limited
  check: (identifier: string, maxAttempts = 5, windowMs = 15 * 60 * 1000): { allowed: boolean; retryAfter?: number } => {
    const now = Date.now();
    const record = rateLimitStore.get(identifier);

    if (!record) {
      rateLimitStore.set(identifier, { attempts: 1, lastAttempt: now });
      return { allowed: true };
    }

    // Check if still blocked
    if (record.blockedUntil && now < record.blockedUntil) {
      return { 
        allowed: false, 
        retryAfter: Math.ceil((record.blockedUntil - now) / 1000) 
      };
    }

    // Reset if window has passed
    if (now - record.lastAttempt > windowMs) {
      record.attempts = 1;
      record.lastAttempt = now;
      delete record.blockedUntil;
      return { allowed: true };
    }

    // Increment attempts
    record.attempts++;
    record.lastAttempt = now;

    if (record.attempts > maxAttempts) {
      record.blockedUntil = now + windowMs;
      return { 
        allowed: false, 
        retryAfter: Math.ceil(windowMs / 1000) 
      };
    }

    return { allowed: true };
  },

  // Reset on successful login
  reset: (identifier: string): void => {
    rateLimitStore.delete(identifier);
  },

  // Clean up old entries (call periodically)
  cleanup: (): void => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (record.blockedUntil && now > record.blockedUntil) {
        rateLimitStore.delete(key);
      }
    }
  }
};

// Input validation and sanitization
export const validateAuthInput = {
  email: (email: string): { valid: boolean; error?: string } => {
    if (!email || typeof email !== 'string') {
      return { valid: false, error: 'Email is required' };
    }
    
    const trimmed = email.trim().toLowerCase();
    if (trimmed.length === 0) {
      return { valid: false, error: 'Email is required' };
    }
    
    if (trimmed.length > 254) {
      return { valid: false, error: 'Email is too long' };
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return { valid: false, error: 'Please enter a valid email address' };
    }
    
    return { valid: true };
  },

  password: (password: string): { valid: boolean; error?: string } => {
    if (!password || typeof password !== 'string') {
      return { valid: false, error: 'Password is required' };
    }
    
    if (password.length < 8) {
      return { valid: false, error: 'Password must be at least 8 characters long' };
    }
    
    if (password.length > 128) {
      return { valid: false, error: 'Password is too long' };
    }
    
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
    
    if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
      return { 
        valid: false, 
        error: 'Password must include uppercase, lowercase, number, and special character' 
      };
    }
    
    return { valid: true };
  },

  name: (name: string, fieldName: string): { valid: boolean; error?: string } => {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: `${fieldName} is required` };
    }
    
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: `${fieldName} is required` };
    }
    
    if (trimmed.length > 50) {
      return { valid: false, error: `${fieldName} is too long` };
    }
    
    // Basic XSS prevention
    if (/<[^>]*>/.test(trimmed)) {
      return { valid: false, error: `${fieldName} contains invalid characters` };
    }
    
    return { valid: true };
  },

  company: (company: string): { valid: boolean; error?: string } => {
    if (!company || typeof company !== 'string') {
      return { valid: false, error: 'Company name is required' };
    }
    
    const trimmed = company.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: 'Company name is required' };
    }
    
    if (trimmed.length > 100) {
      return { valid: false, error: 'Company name is too long' };
    }
    
    // Basic XSS prevention
    if (/<[^>]*>/.test(trimmed)) {
      return { valid: false, error: 'Company name contains invalid characters' };
    }
    
    return { valid: true };
  }
};

// Security headers for auth endpoints
export const getSecurityHeaders = () => ({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';",
});

// Extract client IP for rate limiting
export const getClientIP = (req: NextRequest): string => {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIP = req.headers.get('x-real-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  return 'unknown';
};

// Sanitize user data for responses
export const sanitizeUserData = (user: Record<string, unknown>) => ({
  id: user.id,
  firstName: typeof user.firstName === 'string' ? user.firstName.trim() : (user.firstName || ''),
  lastName: typeof user.lastName === 'string' ? user.lastName.trim() : (user.lastName || ''),
  email: typeof user.email === 'string' ? user.email.toLowerCase().trim() : user.email,
  phone: typeof user.phone === 'string' ? user.phone.trim() : (user.phone || undefined),
  bio: typeof user.bio === 'string' ? user.bio.trim() : (user.bio || undefined),
  location: typeof user.location === 'string' ? user.location.trim() : (user.location || undefined),
  avatar: typeof user.avatar === 'string' ? user.avatar : (user.avatar || null),
  companyId: user.companyId,
  company: user.company, // This will be the full company object now
  region: typeof user.region === 'string' ? user.region : undefined,
  currency: typeof user.currency === 'string' ? user.currency : 'IDR',
  language: typeof user.language === 'string' ? user.language : 'en',
});

// Sanitize company data for responses
export const sanitizeCompanyData = (company: Record<string, unknown>) => ({
  id: company.id,
  name: typeof company.name === 'string' ? company.name.trim() : (company.name || ''),
  businessRegistrationNumber: typeof company.businessRegistrationNumber === 'string' ? company.businessRegistrationNumber.trim() : (company.businessRegistrationNumber || null),
  taxId: typeof company.taxId === 'string' ? company.taxId.trim() : (company.taxId || null),
  logo: typeof company.logo === 'string' ? company.logo : (company.logo || null),
  bannerImage: typeof company.bannerImage === 'string' ? company.bannerImage : (company.bannerImage || null),
  industryType: typeof company.industryType === 'string' ? company.industryType.trim() : (company.industryType || null),
  businessDescription: typeof company.businessDescription === 'string' ? company.businessDescription.trim() : (company.businessDescription || null),
  yearsInOperation: typeof company.yearsInOperation === 'string' ? company.yearsInOperation.trim() : (company.yearsInOperation || null),
  companySize: typeof company.companySize === 'string' ? company.companySize.trim() : (company.companySize || null),
  businessAddress: typeof company.businessAddress === 'string' ? company.businessAddress.trim() : (company.businessAddress || null),
  businessPhone: typeof company.businessPhone === 'string' ? company.businessPhone.trim() : (company.businessPhone || null),
  businessEmail: typeof company.businessEmail === 'string' ? company.businessEmail.toLowerCase().trim() : (company.businessEmail || null),
  documentVerification: Boolean(company.documentVerification),
  businessLicenseVerification: Boolean(company.businessLicenseVerification),
  complianceStatus: typeof company.complianceStatus === 'string' ? company.complianceStatus : 'Pending',
  shippingPreferences: typeof company.shippingPreferences === 'string' ? company.shippingPreferences : (company.shippingPreferences || null),
  deliveryTimeSlots: typeof company.deliveryTimeSlots === 'string' ? company.deliveryTimeSlots : (company.deliveryTimeSlots || null),
  preferredDeliveryDays: typeof company.preferredDeliveryDays === 'string' ? company.preferredDeliveryDays : (company.preferredDeliveryDays || null),
  specialInstructions: typeof company.specialInstructions === 'string' ? company.specialInstructions.trim() : (company.specialInstructions || null),
  pickupAddress: typeof company.pickupAddress === 'string' ? company.pickupAddress : (company.pickupAddress || null),
  defaultDeliveryLeadTimeMinDays: company.defaultDeliveryLeadTimeMinDays != null ? Number(company.defaultDeliveryLeadTimeMinDays) : null,
  defaultDeliveryLeadTimeMaxDays: company.defaultDeliveryLeadTimeMaxDays != null ? Number(company.defaultDeliveryLeadTimeMaxDays) : null,
  createdAt: company.createdAt,
  updatedAt: company.updatedAt,
});

// Session token generation (simple JWT alternative for MVP)
export const generateSessionToken = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

// Password strength indicator
export const getPasswordStrength = (password: string): { 
  score: number; 
  feedback: string;
  color: string;
} => {
  if (!password) return { score: 0, feedback: 'Enter a password', color: 'gray' };
  
  let score = 0;
  const checks = [
    { test: /.{8,}/, points: 1, message: 'At least 8 characters' },
    { test: /[A-Z]/, points: 1, message: 'Uppercase letter' },
    { test: /[a-z]/, points: 1, message: 'Lowercase letter' },
    { test: /\d/, points: 1, message: 'Number' },
    { test: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/, points: 1, message: 'Special character' },
  ];
  
  checks.forEach(check => {
    if (check.test.test(password)) score += check.points;
  });
  
  if (score < 2) return { score, feedback: 'Weak', color: 'red' };
  if (score < 4) return { score, feedback: 'Fair', color: 'orange' };
  if (score < 5) return { score, feedback: 'Good', color: 'blue' };
  return { score, feedback: 'Strong', color: 'green' };
};
