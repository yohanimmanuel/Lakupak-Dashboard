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

  it('moves linked summary and history supplies from supplier A to supplier B', async () => {
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
    await replaceSupplierSupplyRecords(prisma, supplierA.id, [summary, history, unrelated]);

    await syncSupplierFromProduct({
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
    });

    const [onA, onB] = await Promise.all([
      loadSupplierSupplies(prisma, supplierA.id),
      loadSupplierSupplies(prisma, supplierB.id),
    ]);

    expect(onA.map((r) => r.suppliesno)).toEqual(['HIST-OTHER']);
    expect(onB.some((r) => r.recordType === 'summary' && r.productId === productId)).toBe(true);
    expect(onB.find((r) => r.recordType === 'summary')?.totalSupplied).toBe('250');
    expect(onB.find((r) => r.recordType === 'summary')?.totalValue).toBe('1250000');
    expect(onB.some((r) => r.suppliesno === 'HIST-MOVE-1' && r.recordType === 'history')).toBe(true);
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

    await removeProductSupplies({ userId: distributor.id, productId });

    const rows = await loadSupplierSupplies(prisma, supplier.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].suppliesno).toBe('HIST-KEEP');
  });
});
