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

type MeiliEnqueuedTask = { taskUid?: number };

async function waitForMeiliIndexingTask(
  client: NonNullable<ReturnType<typeof getMeiliClient>>,
  task: MeiliEnqueuedTask | undefined,
  timeoutMs = 8_000,
): Promise<void> {
  const taskUid = task?.taskUid;
  if (taskUid == null) return;

  const waiter = client as unknown as {
    waitForTask?: (
      uid: number,
      opts?: { timeout?: number; interval?: number },
    ) => Promise<{ status?: string; error?: { message?: string } | null }>;
  };
  if (typeof waiter.waitForTask === 'function') {
    const result = await waiter.waitForTask(taskUid, { timeout: timeoutMs, interval: 50 });
    if (result?.status && result.status !== 'succeeded') {
      throw new Error(result.error?.message ?? `Meili task ${taskUid} ${result.status}`);
    }
    return;
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const polled = await client.tasks.getTask(taskUid);
    const status = (polled as { status?: string }).status;
    if (status === 'succeeded') return;
    if (status === 'failed' || status === 'canceled') {
      throw new Error(`Meili task ${taskUid} ${status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Meili task ${taskUid} timed out after ${timeoutMs}ms`);
}

/**
 * Syncs the given products into the Meili index in one round trip. Ids that are no
 * longer marketplace-published are removed instead, so the index stays 1:1 with the DB.
 *
 * Pass `waitForIndexing` when callers must not treat the product as marketplace-visible
 * until Meili has finished the enqueued add/delete (search uses this index).
 */
export async function upsertMarketplaceProductsToMeili(
  productIds: string[],
  opts?: { waitForIndexing?: boolean },
) {
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
  const indexingTasks: MeiliEnqueuedTask[] = [];
  if (docs.length > 0) {
    indexingTasks.push(await index.addDocuments(docs, { primaryKey: 'id' }));
  }
  if (unpublishedIds.length > 0) {
    indexingTasks.push(await index.deleteDocuments(unpublishedIds));
  }
  if (opts?.waitForIndexing) {
    await Promise.all(indexingTasks.map((task) => waitForMeiliIndexingTask(client, task)));
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
