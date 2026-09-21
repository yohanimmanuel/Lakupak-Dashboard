import { describe, expect, it } from 'vitest';
import {
  normalizePickedBuyers,
  toPickedBuyer,
} from '@/components/automations/builder/BuyerPickerField';
import type { Buyer } from '@/types/client';

describe('buyer picker canvas state', () => {
  it('keeps selectedBuyers from node config when normalizing', () => {
    const picked = normalizePickedBuyers({
      selectedBuyers: [
        {
          buyerId: 'mobile_user_12_3',
          buyerLabel: 'Idle Mart',
          buyerPhone: '+620000000201',
          buyerEmail: 'idle@example.com',
        },
      ],
      buyerId: 'mobile_user_12_3',
    });
    expect(picked).toEqual([
      {
        buyerId: 'mobile_user_12_3',
        buyerLabel: 'Idle Mart',
        buyerPhone: '+620000000201',
        buyerEmail: 'idle@example.com',
      },
    ]);
  });

  it('does not drop picks just because the live catalog has not loaded yet', () => {
    const config = {
      selectedBuyers: [
        { buyerId: 'B1', buyerLabel: 'One', buyerPhone: '1', buyerEmail: 'a@b.c' },
        { buyerId: 'B2', buyerLabel: 'Two', buyerPhone: '2', buyerEmail: 'c@d.e' },
      ],
    };
    expect(normalizePickedBuyers(config).map((b) => b.buyerId)).toEqual(['B1', 'B2']);
    expect(normalizePickedBuyers(config)).toEqual(normalizePickedBuyers(config));
  });

  it('treats buyers without an external buyerId as invalid', () => {
    const buyer = {
      id: 44,
      buyerId: '',
      owner: 'Pat',
      storeName: 'Pat Shop',
      email: 'pat@example.com',
      phone: '+62001',
      businessType: '',
      address: '',
      status: 'active',
    } as Buyer;
    expect(toPickedBuyer(buyer).buyerId).toBe('');
    expect(
      normalizePickedBuyers({
        selectedBuyers: [{ id: 44, buyerLabel: 'Pat Shop' }],
      }),
    ).toEqual([]);
  });
});
