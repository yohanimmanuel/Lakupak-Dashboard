import { getMeiliClient, MEILI_PRODUCTS_INDEX } from '@/lib/meili';
import { prisma } from '@/lib/db';

type MeiliMarketplaceDoc = {
  id: string; // productId
  name: string;
  description: string;
  brand: string | null;
  productType: string;
  salesChannel: string | null;
  sellerName: string | null;
  sellingPrice: number | null;
  publishedAt: string | null;
  lastSyncAt: string | null;
};

export async function upsertMarketplaceProductToMeili(productId: string) {
  const client = getMeiliClient();
  if (!client) return;

  const p = await prisma.product.findFirst({
    where: { productId, marketplaceStatus: 'Published', status: 'Published' },
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

  // If it's not published anymore, ensure it's deleted.
  if (!p) {
    await deleteMarketplaceProductFromMeili(productId);
    return;
  }

  const doc: MeiliMarketplaceDoc = {
    id: p.productId,
    name: p.name,
    description: p.description,
    brand: p.brand ?? null,
    productType: p.productType,
    salesChannel: p.productCategory ?? null,
    sellerName: p.user?.company?.name ?? null,
    sellingPrice: p.variantOptions?.[0]?.sellingPrice != null ? Number(p.variantOptions[0].sellingPrice) : null,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    lastSyncAt: p.lastSyncAt ? p.lastSyncAt.toISOString() : null,
  };

  const index = client.index(MEILI_PRODUCTS_INDEX);
  const task = await index.addDocuments([doc], { primaryKey: 'id' });
  await client.tasks.waitForTask(task.taskUid);
}

export async function deleteMarketplaceProductFromMeili(productId: string) {
  const client = getMeiliClient();
  if (!client) return;
  const index = client.index(MEILI_PRODUCTS_INDEX);
  const task = await index.deleteDocument(productId);
  await client.tasks.waitForTask(task.taskUid);
}

