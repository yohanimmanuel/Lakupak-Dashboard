import { describe, expect, it } from 'vitest';
import { validateBuyerId, validateOrderId } from '@/utils/order-security';

describe('order-security id formats', () => {
  it('accepts marketplace checkout order ids with optional group suffix', () => {
    expect(validateOrderId('LKO-17301234567890123456')).toBe(true);
    expect(validateOrderId('LKO-17301234567890123456-0')).toBe(true);
    expect(validateOrderId('LKO-17301234567890123456-1')).toBe(true);
  });

  it('rejects invalid order id shapes', () => {
    expect(validateOrderId('LKO-abc')).toBe(false);
    expect(validateOrderId('ORD-123')).toBe(false);
    expect(validateOrderId('')).toBe(false);
  });

  it('accepts mobile buyer ids with optional distributor suffix', () => {
    expect(validateBuyerId('LKB-00000012')).toBe(true);
    expect(validateBuyerId('LKB-00000012-45')).toBe(true);
  });

  it('rejects invalid buyer id shapes', () => {
    expect(validateBuyerId('LKB-abc')).toBe(false);
    expect(validateBuyerId('BUYER-1')).toBe(false);
  });
});
