import { getMeiliClient, MEILI_PRODUCTS_INDEX } from '@/lib/meili';
import { prisma } from '@/lib/db';

type MeiliMarketplaceDoc = {
  id: string; // productId
  name: string;
  description: string;
  brand: string | null;
  productType: string;
  salesChannel: string | null;
  companyName: string | null;
  sellingPrice: number | null;
  publishedAt: string | null;
  lastSyncAt: string | null;
};

export async function upsertMarketplaceProductToMeili(productId: string) {
  await upsertMarketplaceProductsToMeili([productId]);
}

/**
 * Syncs the given products into the Meili index in one round trip. Ids that are no
 * longer marketplace-published are removed instead, so the index stays 1:1 with the DB.
 *
 * Meili indexes asynchronously: the enqueued task is not awaited, so a document may
 * become searchable a moment after this resolves.
 */
export async function upsertMarketplaceProductsToMeili(productIds: string[]) {
  const client = getMeiliClient();
  if (!client || productIds.length === 0) return;

  const products = await prisma.product.findMany({
    where: { productId: { in: productIds }, marketplaceStatus: 'Published', status: 'Published' },
    select: {
      productId: true,
      name: true,
      description: true,
      brand: true,
      productType: true,
      productCategory: true,
      publishedAt: true,
      lastSyncAt: true,
      variantOptions: {
        select: { sellingPrice: true },
        take: 1,
        orderBy: { isDefault: 'desc' },
      },
      user: { select: { company: { select: { name: true } } } },
    },
  });

  const docs: MeiliMarketplaceDoc[] = products.map((p) => ({
    id: p.productId,
    name: p.name,
    description: p.description,
    brand: p.brand ?? null,
    productType: p.productType,
    salesChannel: p.productCategory ?? null,
    companyName: p.user?.company?.name ?? null,
    sellingPrice: p.variantOptions?.[0]?.sellingPrice != null ? Number(p.variantOptions[0].sellingPrice) : null,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    lastSyncAt: p.lastSyncAt ? p.lastSyncAt.toISOString() : null,
  }));

  const indexedIds = new Set(docs.map((doc) => doc.id));
  const unpublishedIds = productIds.filter((id) => !indexedIds.has(id));

  const index = client.index(MEILI_PRODUCTS_INDEX);
  if (docs.length > 0) {
    await index.addDocuments(docs, { primaryKey: 'id' });
  }
  if (unpublishedIds.length > 0) {
    await index.deleteDocuments(unpublishedIds);
  }
}

export async function deleteMarketplaceProductFromMeili(productId: string) {
  await deleteMarketplaceProductsFromMeili([productId]);
}

export async function deleteMarketplaceProductsFromMeili(productIds: string[]) {
  const client = getMeiliClient();
  if (!client || productIds.length === 0) return;
  await client.index(MEILI_PRODUCTS_INDEX).deleteDocuments(productIds);
}
