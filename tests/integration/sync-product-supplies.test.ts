
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  removeProductSupplies,
  supplyAutoNo,
  syncSupplierFromProduct,
} from '@/lib/suppliers/syncProductSupplies';
import {
  loadSupplierSupplies,
  replaceSupplierSupplyRecords,
} from '@/lib/suppliers/supplyRecordStore';
import type { SupplyDetail } from '@/types/client';
import { resetDb } from './helpers';
import { createTestDistributor } from './helpers/productFixtures';

describe('syncSupplierFromProduct supplier change (integration)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('keeps existing supplier opening balances and history in place until explicitly transferred', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-SUPPLY-MOVE-1';
    const autoNo = supplyAutoNo(productId, 'Default');

    const summary: SupplyDetail = {
      suppliesno: autoNo,
      sku: `${productId}|Default`,
      product: 'Move Test Widget (Default)',
      totalSupplied: '250',
      totalValue: '1250000',
      lastDelivery: '',
      status: 'Active',
      recordType: 'summary',
      productId,
      variantName: 'Default',
    };

    const history: SupplyDetail = {
      suppliesno: 'HIST-MOVE-1',
      sku: 'SKU-MOVE-1',
      product: 'Move Test Widget (Default)',
      totalSupplied: '50',
      totalValue: '250000',
      lastDelivery: '2026-04-01',
      status: 'Active',
      recordType: 'history',
      productId,
      variantName: 'Default',
    };

    const unrelated: SupplyDetail = {
      suppliesno: 'HIST-OTHER',
      sku: 'SKU-OTHER',
      product: 'Unrelated',
      totalSupplied: '9',
      totalValue: '9000',
      lastDelivery: '2026-01-01',
      status: 'Active',
      recordType: 'history',
      productId: 'P-OTHER',
    };

    const supplierA = await prisma.supplier.create({
      data: {
        supplierId: `LKS-A-${distributor.id}`,
        name: 'Supplier A',
        contact: 'A',
        email: 'a@test.local',
        phone: '100',
        businessType: 'Distributor',
        address: 'A St',
        status: 'Active',
        userId: distributor.id,
      },
    });

    const supplierB = await prisma.supplier.create({
      data: {
        supplierId: `LKS-B-${distributor.id}`,
        name: 'Supplier B',
        contact: 'B',
        email: 'b@test.local',
        phone: '200',
        businessType: 'Distributor',
        address: 'B St',
        status: 'Active',
        userId: distributor.id,
      },
    });

    await replaceSupplierSupplyRecords(
      prisma,
      supplierA.id,
      [summary, history, unrelated],
    );

    const productSnapshot = {
      productId,
      name: 'Move Test Widget',
      supplier: 'Supplier B',
      userId: distributor.id,
      variantOptions: [
        {
          variantName: 'Default',
          sku: 'SKU-MOVE-1',
          purchasePrice: '5000',
          stockQuantity: 250,
          isActive: true,
        },
      ],
    };

    // Changing the Product Catalog supplier must not automatically
    // move existing opening balances or historical supply records.
    await syncSupplierFromProduct(productSnapshot);

    const [onA, onB] = await Promise.all([
      loadSupplierSupplies(prisma, supplierA.id),
      loadSupplierSupplies(prisma, supplierB.id),
    ]);

    // Supplier A retains its original opening balance,
    // historical supply, and unrelated record.
    expect(onA.map((r) => r.suppliesno).sort()).toEqual(
      [autoNo, 'HIST-MOVE-1', 'HIST-OTHER'].sort(),
    );

    expect(
      onA.find((r) => r.suppliesno === autoNo)?.totalSupplied,
    ).toBe('250');

    expect(
      onA.find((r) => r.suppliesno === autoNo)?.totalValue,
    ).toBe('1250000');

    expect(
      onA.some((r) => r.suppliesno === 'HIST-MOVE-1'),
    ).toBe(true);

    expect(
      onA.some((r) => r.suppliesno === 'HIST-OTHER'),
    ).toBe(true);

    // Supplier B must not receive a duplicate opening balance.
    // Existing opening balances remain with Supplier A
    // until the user explicitly transfers them.
    expect(
      onB.some(
        (r) =>
          r.recordType === 'summary' &&
          r.productId === productId &&
          r.variantName === 'Default',
      ),
    ).toBe(false);

    // Historical supplies must never move automatically.
    expect(
      onB.some((r) => r.suppliesno === 'HIST-MOVE-1'),
    ).toBe(false);

    // Repeated synchronization must be idempotent.
    // It must not generate duplicate opening balances.
    await syncSupplierFromProduct(productSnapshot);

    const [afterA, afterB] = await Promise.all([
      loadSupplierSupplies(prisma, supplierA.id),
      loadSupplierSupplies(prisma, supplierB.id),
    ]);

    expect(afterA).toHaveLength(onA.length);
    expect(afterB).toHaveLength(onB.length);

    expect(
      afterA.map((r) => r.suppliesno).sort(),
    ).toEqual(onA.map((r) => r.suppliesno).sort());

    expect(
      afterA.find((r) => r.suppliesno === autoNo)?.totalSupplied,
    ).toBe('250');

    expect(
      afterA.find((r) => r.suppliesno === autoNo)?.totalValue,
    ).toBe('1250000');

    expect(
      afterB.some(
        (r) =>
          r.recordType === 'summary' &&
          r.productId === productId,
      ),
    ).toBe(false);

    expect(
      afterB.some((r) => r.suppliesno === 'HIST-MOVE-1'),
    ).toBe(false);
  });

  it('removes linked summary and history supplies when a product is deleted', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-SUPPLY-DEL-1';
    const autoNo = supplyAutoNo(productId, 'Default');

    const supplier = await prisma.supplier.create({
      data: {
        supplierId: `LKS-DEL-${distributor.id}`,
        name: 'Supplier Delete',
        contact: 'D',
        email: 'd@test.local',
        phone: '300',
        businessType: 'Distributor',
        address: 'D St',
        status: 'Active',
        userId: distributor.id,
      },
    });

    await replaceSupplierSupplyRecords(prisma, supplier.id, [
      {
        suppliesno: autoNo,
        sku: `${productId}|Default`,
        product: 'Delete Widget (Default)',
        totalSupplied: '80',
        totalValue: '400000',
        lastDelivery: '',
        status: 'Active',
        recordType: 'summary',
        productId,
        variantName: 'Default',
      },
      {
        suppliesno: 'HIST-DEL-1',
        sku: 'SKU-DEL-1',
        product: 'Delete Widget (Default)',
        totalSupplied: '20',
        totalValue: '100000',
        lastDelivery: '2026-05-01',
        status: 'Active',
        recordType: 'history',
        productId,
        variantName: 'Default',
      },
      {
        suppliesno: 'HIST-KEEP',
        sku: 'SKU-KEEP',
        product: 'Keep Me',
        totalSupplied: '3',
        totalValue: '3000',
        lastDelivery: '2026-01-01',
        status: 'Active',
        recordType: 'history',
        productId: 'P-KEEP',
      },
    ] satisfies SupplyDetail[]);

    await removeProductSupplies({
      userId: distributor.id,
      productId,
    });

    const rows = await loadSupplierSupplies(prisma, supplier.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].suppliesno).toBe('HIST-KEEP');
  });
});
