import { describe, expect, it } from 'vitest';
import {
  collectAutomationDryRunIssues,
  defaultConfigForFields,
  parseIdleHours,
} from '@/lib/automations/catalog';

describe('cart idle catalog', () => {
  it('parseIdleHours requires a positive number', () => {
    expect(parseIdleHours({ hours: 2 })).toBe(2);
    expect(parseIdleHours({ hours: '1.5' })).toBe(1.5);
    expect(parseIdleHours({ hours: '2hours' })).toBeNull();
    expect(parseIdleHours({ hours: 0 })).toBeNull();
    expect(parseIdleHours({ hours: '' })).toBeNull();
    expect(parseIdleHours({})).toBeNull();
  });

  it('allows saving cart_winback without pre-selected buyers', () => {
    const issues = collectAutomationDryRunIssues({
      triggerType: 'cart_idle',
      triggerConfig: { hours: 2 },
      actionType: 'cart_winback',
      actionConfig: {
        channel: 'both',
        messageTemplate: 'Your cart is waiting',
        messageCategory: 'MARKETING',
      },
      nodes: [
        { data: { kind: 'trigger', catalogType: 'cart_idle', config: { hours: 2 } } },
        { data: { kind: 'app', catalogType: 'app_webhook', config: { phone: '+628111' } } },
        { data: { kind: 'app', catalogType: 'app_email', config: { email: 'ops@example.com' } } },
        {
          data: {
            kind: 'action',
            catalogType: 'cart_winback',
            config: {
              channel: 'both',
              messageTemplate: 'Your cart is waiting',
              messageCategory: 'MARKETING',
            },
          },
        },
      ],
    });
    expect(issues).toEqual([]);
  });

  it('still requires idle hours on the cart_idle trigger', () => {
    const issues = collectAutomationDryRunIssues({
      triggerType: 'cart_idle',
      triggerConfig: { hours: '' },
      actionType: 'cart_winback',
      actionConfig: {
        channel: 'whatsapp',
        messageTemplate: 'Your cart is waiting',
        messageCategory: 'MARKETING',
      },
      nodes: [
        { data: { kind: 'trigger', catalogType: 'cart_idle', config: { hours: '' } } },
        { data: { kind: 'app', catalogType: 'app_webhook', config: { phone: '+628111' } } },
        {
          data: {
            kind: 'action',
            catalogType: 'cart_winback',
            config: {
              channel: 'whatsapp',
              messageTemplate: 'Your cart is waiting',
              messageCategory: 'MARKETING',
            },
          },
        },
      ],
    });
    expect(issues.some((issue) => issue.includes('idle hours'))).toBe(true);
  });

  it('treats linked offer as optional on cart_winback', () => {
    const config = defaultConfigForFields([{ key: 'offerId', kind: 'offer' }]);
    expect(config.offerId).toBe('');
    expect(config.selectedOffers).toEqual([]);

    const issues = collectAutomationDryRunIssues({
      triggerType: 'cart_idle',
      triggerConfig: { hours: 2 },
      actionType: 'cart_winback',
      actionConfig: {
        channel: 'email',
        messageTemplate: 'Come back for {{offerName}}',
        offerId: '',
        selectedOffers: [],
      },
      nodes: [
        { data: { kind: 'trigger', catalogType: 'cart_idle', config: { hours: 2 } } },
        { data: { kind: 'app', catalogType: 'app_email', config: { email: 'ops@example.com' } } },
        {
          data: {
            kind: 'action',
            catalogType: 'cart_winback',
            config: {
              channel: 'email',
              messageTemplate: 'Come back for {{offerName}}',
              offerId: '',
              selectedOffers: [],
            },
          },
        },
      ],
    });
    expect(issues).toEqual([]);
  });
});
