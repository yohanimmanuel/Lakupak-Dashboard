
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { createProduct } from '@/app/api/graphql/modules/products';
import {
  removeProductFromSupplierMaps,
  removeProductSupplies,
  removeProductSuppliesInTransaction,
  removeProductVariantsSuppliesInTransaction,
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

  it('preserves old supplier history without automatically duplicating opening balances', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-SUPPLY-MOVE-1';
    const autoNo = supplyAutoNo(productId, 'Default');

    const summary: SupplyDetail = {
      suppliesno: autoNo,
      sku: `${productId}|Default`,
      product: 'Move Test Widget (Default)',
      totalSupplied: '250',
      totalValue: '1250000',
      lastSuppliedDate: '',
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
      lastSuppliedDate: '2026-04-01',
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
      lastSuppliedDate: '2026-01-01',
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

    // Supplier reassignment must not create a second opening balance.
    const openingOnB = onB.filter(
      (r) =>
        r.recordType === 'summary' &&
        r.productId === productId &&
        r.variantName === 'Default',
    );
    expect(openingOnB).toHaveLength(0);

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

    const openingAfterSync = afterB.filter(
      (r) => r.recordType === 'summary' && r.productId === productId,
    );
    expect(openingAfterSync).toHaveLength(0);

    expect(
      afterB.some((r) => r.suppliesno === 'HIST-MOVE-1'),
    ).toBe(false);
  });

  it('reconciles AUTO summary to current variant stock without accumulating on repeated sync', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-SUPPLY-SNAPSHOT-IDEMPOTENT';
    const supplier = await prisma.supplier.create({
      data: {
        supplierId: `LKS-SNAPSHOT-${distributor.id}`,
        name: 'Snapshot Supplier', contact: 'S', email: 'snapshot@test.local',
        phone: '555', businessType: 'Distributor', address: 'S St', status: 'Active', userId: distributor.id,
      },
    });
    await createProduct({
      userId: distributor.id,
      productId,
      name: 'Snapshot Widget',
      description: 'Test',
      productType: 'Test',
      brand: 'Test',
      supplier: supplier.name,
      status: 'Published',
      catalogName: 'Default',
      images: ['https://example.com/snapshot-widget.jpg'],
      variantOptions: [{
        variantName: 'Default',
        attributes: {},
        sku: 'SKU-SNAPSHOT',
        purchasePrice: '1000',
        sellingPrice: '1500',
        originalSellingPrice: '1500',
        moq: 1,
        stockQuantity: 500,
        lowStockThreshold: 0,
        stockStatus: 'In Stock',
        isDefault: true,
        isActive: true,
      }],
    });
    const product = await prisma.product.findFirst({
      where: { productId, userId: distributor.id },
      include: { variantOptions: true },
    });
    if (!product) throw new Error('Fixture product was not created');
    const snapshot = {
      productId: product.productId,
      name: product.name,
      supplier: product.supplier,
      userId: distributor.id,
      variantOptions: product.variantOptions.map((v) => ({
        variantName: v.variantName, sku: v.sku, purchasePrice: v.purchasePrice,
        stockQuantity: v.stockQuantity, isActive: v.isActive,
      })),
    };

    await syncSupplierFromProduct(snapshot);
    await syncSupplierFromProduct(snapshot);
    let rows = await loadSupplierSupplies(prisma, supplier.id);
    expect(rows.filter((row) => row.suppliesno === supplyAutoNo(productId, 'Default'))).toHaveLength(1);
    expect(rows.find((row) => row.suppliesno === supplyAutoNo(productId, 'Default'))?.totalSupplied).toBe('500');

    await prisma.variantOption.updateMany({ where: { productId: product.id }, data: { stockQuantity: 350 } });
    const refreshed = await prisma.product.findUnique({ where: { id: product.id }, include: { variantOptions: true } });
    if (!refreshed) throw new Error('Fixture product disappeared');
    await syncSupplierFromProduct({
      ...snapshot,
      variantOptions: refreshed.variantOptions.map((v) => ({
        variantName: v.variantName, sku: v.sku, purchasePrice: v.purchasePrice,
        stockQuantity: v.stockQuantity, isActive: v.isActive,
      })),
    });
    rows = await loadSupplierSupplies(prisma, supplier.id);
    expect(rows.filter((row) => row.suppliesno === supplyAutoNo(productId, 'Default'))).toHaveLength(1);
    expect(rows.find((row) => row.suppliesno === supplyAutoNo(productId, 'Default'))?.totalSupplied).toBe('350');
  });

  it('rolls back supplier cleanup when the surrounding product deletion transaction fails', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-SUPPLY-DEL-ROLLBACK';
    const supplier = await prisma.supplier.create({
      data: {
        supplierId: `LKS-DEL-RB-${distributor.id}`,
        name: 'Supplier Delete Rollback',
        contact: 'D', email: 'rollback@test.local', phone: '301',
        businessType: 'Distributor', address: 'D St', status: 'Active', userId: distributor.id,
      },
    });
    await replaceSupplierSupplyRecords(prisma, supplier.id, [
      {
        suppliesno: 'AUTO-P-SUPPLY-DEL-ROLLBACK|Default', sku: 'SKU-DEL-RB',
        product: 'Rollback Widget', totalSupplied: '80', totalValue: '400000',
        lastSuppliedDate: '', status: 'Active', recordType: 'summary',
        productId, variantName: 'Default',
      },
      {
        suppliesno: 'HIST-DEL-RB', sku: 'SKU-DEL-RB', product: 'Rollback Widget',
        totalSupplied: '20', totalValue: '100000', lastSuppliedDate: '2026-05-01',
        status: 'Active', recordType: 'history', productId, variantName: 'Default',
      },
    ] satisfies SupplyDetail[]);

    await expect(prisma.$transaction(async (tx) => {
      await removeProductSuppliesInTransaction(tx, { userId: distributor.id, productId });
      throw new Error('simulate product delete failure');
    })).rejects.toThrow('simulate product delete failure');

    const rows = await loadSupplierSupplies(prisma, supplier.id);
    expect(rows.map((row) => row.suppliesno).sort()).toEqual([
      'AUTO-P-SUPPLY-DEL-ROLLBACK|Default',
      'HIST-DEL-RB',
    ]);
  });

  it('deletes legacy imported rows by exact catalog SKU hints without removing rows linked elsewhere', () => {
    const productId = 'P-DEL-HINTS';
    const suppliesBySupplierId = new Map<number, SupplyDetail[]>([
      [1, [
        {
          suppliesno: 'HIST-ACCURATE-IMPORT', sku: 'CATALOG-SKU-1',
          product: 'Distributor-specific imported name', totalSupplied: '40', totalValue: '400',
          lastSuppliedDate: '2026-02-01', status: 'Active', recordType: 'history',
        },
        {
          suppliesno: 'HIST-KEEP-OTHER', sku: 'CATALOG-SKU-1',
          product: 'Other linked product', totalSupplied: '10', totalValue: '100',
          lastSuppliedDate: '2026-02-01', status: 'Active', recordType: 'history', productId: 'P-OTHER',
        },
      ]],
    ]);
    const dirty = new Set<number>();

    removeProductFromSupplierMaps(
      { productId },
      suppliesBySupplierId,
      [{ id: 1, name: 'Supplier A' }],
      dirty,
      { skus: ['CATALOG-SKU-1'], labels: ['Catalog product (Default)'] },
    );

    expect(dirty.has(1)).toBe(true);
    expect((suppliesBySupplierId.get(1) || []).map((row) => row.suppliesno)).toEqual(['HIST-KEEP-OTHER']);
  });

  it('preserves deleted variant summary and history as historical snapshots', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-SUPPLY-VARIANT-DEL-1';
    const bbqName = 'Flavor: BBQ';
    const spicyName = 'Flavor: Spicy';
    const supplier = await prisma.supplier.create({
      data: {
        supplierId: `LKS-VAR-DEL-${distributor.id}`,
        name: 'Supplier Variant Delete',
        contact: 'V',
        email: 'variant-delete@test.local',
        phone: '400',
        businessType: 'Distributor',
        address: 'V St',
        status: 'Active',
        userId: distributor.id,
      },
    });

    await replaceSupplierSupplyRecords(prisma, supplier.id, [
      {
        suppliesno: supplyAutoNo(productId, bbqName),
        sku: 'SKU-BBQ',
        product: `Potato Chips (${bbqName})`,
        totalSupplied: '80',
        totalValue: '400000',
        lastSuppliedDate: '',
        status: 'Active',
        recordType: 'summary',
        productId,
        variantName: bbqName,
      },
      {
        suppliesno: 'HIST-VARIANT-BBQ',
        sku: 'SKU-BBQ',
        product: `Potato Chips (${bbqName})`,
        totalSupplied: '20',
        totalValue: '100000',
        lastSuppliedDate: '2026-05-01',
        status: 'Active',
        recordType: 'history',
        productId,
        variantName: bbqName,
      },
      {
        suppliesno: supplyAutoNo(productId, spicyName),
        sku: 'SKU-SPICY',
        product: `Potato Chips (${spicyName})`,
        totalSupplied: '60',
        totalValue: '300000',
        lastSuppliedDate: '',
        status: 'Active',
        recordType: 'summary',
        productId,
        variantName: spicyName,
      },
      {
        suppliesno: 'HIST-VARIANT-SPICY',
        sku: 'SKU-SPICY',
        product: `Potato Chips (${spicyName})`,
        totalSupplied: '10',
        totalValue: '50000',
        lastSuppliedDate: '2026-05-02',
        status: 'Active',
        recordType: 'history',
        productId,
        variantName: spicyName,
      },
      {
        suppliesno: 'HIST-OTHER-PRODUCT',
        sku: 'SKU-OTHER-PRODUCT',
        product: 'Other Product (Flavor: BBQ)',
        totalSupplied: '5',
        totalValue: '25000',
        lastSuppliedDate: '2026-05-03',
        status: 'Active',
        recordType: 'history',
        productId: 'P-OTHER-PRODUCT',
        variantName: bbqName,
      },
    ] satisfies SupplyDetail[]);

    await prisma.$transaction(async (tx) => {
      await removeProductVariantsSuppliesInTransaction(tx, {
        userId: distributor.id,
        productId,
        name: 'Potato Chips',
        removedVariants: [{ variantName: bbqName, sku: 'SKU-BBQ' }],
        allVariants: [
          { variantName: bbqName, sku: 'SKU-BBQ' },
          { variantName: spicyName, sku: 'SKU-SPICY' },
        ],
      });
    });

    const rows = await loadSupplierSupplies(prisma, supplier.id);
    expect(rows.map((row) => row.suppliesno).sort()).toEqual([
      supplyAutoNo(productId, bbqName),
      supplyAutoNo(productId, spicyName),
      'HIST-VARIANT-BBQ',
      'HIST-VARIANT-SPICY',
      'HIST-OTHER-PRODUCT',
    ].sort());
  });

  it('preserves linked summary and history supplies when a product is deleted', async () => {
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
        lastSuppliedDate: '',
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
        lastSuppliedDate: '2026-05-01',
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
        lastSuppliedDate: '2026-01-01',
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

    expect(rows.map((row) => row.suppliesno).sort()).toEqual([
      autoNo,
      'HIST-DEL-1',
      'HIST-KEEP',
    ].sort());
  });
});
