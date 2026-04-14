import 'dotenv/config';
import { prisma } from '@/app/api/graphql/modules/common/prisma';
import { getMeiliClient, MEILI_PRODUCTS_INDEX } from '@/lib/meili';

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

type MeiliTaskStatus = 'enqueued' | 'processing' | 'succeeded' | 'failed' | 'canceled';

function tempIndexName(base: string) {
  return `${base}__tmp_${Date.now()}`;
}

async function ensureIndexExists(client: ReturnType<typeof getMeiliClient>, uid: string, primaryKey: string) {
  if (!client) throw new Error('Meili client not initialized');
  try {
    await client.getIndex(uid);
  } catch {
    const task = await client.createIndex(uid, { primaryKey });
    await waitForMeiliTask(client, task.taskUid, `createIndex(${uid})`);
  }
}

async function waitForMeiliTask(
  client: NonNullable<ReturnType<typeof getMeiliClient>>,
  taskUid: number,
  label: string,
) {
  // Prefer SDK helper when available.
  const anyTasks = (client as any).tasks;
  if (anyTasks && typeof anyTasks.waitForTask === 'function') {
    const task = await anyTasks.waitForTask(taskUid);
    const status = task?.status as MeiliTaskStatus | undefined;
    if (status && status !== 'succeeded') {
      throw new Error(`${label} failed (taskUid=${taskUid}, status=${status}): ${task?.error?.message ?? 'unknown error'}`);
    }
    return;
  }

  // Fallback polling for older SDKs / environments.
  const start = Date.now();
  const timeoutMs = 10 * 60 * 1000;
  while (true) {
    const task = await client.tasks.getTask(taskUid);
    const status = task.status as MeiliTaskStatus;
    if (status === 'succeeded') return;
    if (status === 'failed' || status === 'canceled') {
      throw new Error(`${label} failed (taskUid=${taskUid}, status=${status}): ${task?.error?.message ?? 'unknown error'}`);
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`${label} timed out waiting for taskUid=${taskUid} (lastStatus=${status})`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function main() {
  const client = getMeiliClient();
  if (!client) {
    throw new Error('Missing MEILI_HOST env var');
  }

  const indexSettings = {
    searchableAttributes: ['name', 'description', 'brand', 'productType', 'sellerName'],
    filterableAttributes: ['productType', 'salesChannel', 'sellerName'],
    sortableAttributes: ['sellingPrice', 'publishedAt', 'lastSyncAt'],
    rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
    typoTolerance: { enabled: true },
  };

  const products = await prisma.product.findMany({
    where: {
      marketplaceStatus: 'Published',
      status: 'Published',
    },
    select: {
      productId: true,
      name: true,
      description: true,
      brand: true,
      productType: true,
      productCategory: true, // sales channel
      publishedAt: true,
      lastSyncAt: true,
      variantOptions: {
        select: {
          sellingPrice: true,
        },
        take: 1,
        orderBy: { isDefault: 'desc' },
      },
      user: {
        select: {
          company: {
            select: { name: true },
          },
        },
      },
    },
  });

  const docs: MeiliMarketplaceDoc[] = products.map((p) => ({
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
  }));

  // Safe reindex: build in a temporary index, then atomically swap with production.
  // This avoids data loss if the process crashes mid-reindex and ensures we don't exit before tasks succeed.
  const tmpUid = tempIndexName(MEILI_PRODUCTS_INDEX);
  await ensureIndexExists(client, MEILI_PRODUCTS_INDEX, 'id');
  await ensureIndexExists(client, tmpUid, 'id');

  const tmpIndex = client.index(tmpUid);

  const settingsTask = await tmpIndex.updateSettings(indexSettings);
  await waitForMeiliTask(client, settingsTask.taskUid, `updateSettings(${tmpUid})`);

  const addTask = await tmpIndex.addDocuments(docs, { primaryKey: 'id' });
  await waitForMeiliTask(client, addTask.taskUid, `addDocuments(${tmpUid})`);

  // Some Meili servers accept only `{ indexes: [a, b] }` even if the SDK type includes `rename`.
  const swapTask = await client.swapIndexes([{ indexes: [MEILI_PRODUCTS_INDEX, tmpUid] }] as any);
  await waitForMeiliTask(client, swapTask.taskUid, `swapIndexes(${MEILI_PRODUCTS_INDEX}<->${tmpUid})`);

  // After swap, tmpUid now points at the old production index. Clean it up.
  const deleteTask = await client.deleteIndex(tmpUid);
  await waitForMeiliTask(client, deleteTask.taskUid, `deleteIndex(${tmpUid})`);

  console.log(`Meili reindex completed (swapped in ${MEILI_PRODUCTS_INDEX})`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    // Ensure the process exits (HTTP keep-alive can keep Node alive)
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

