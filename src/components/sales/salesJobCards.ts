import { SalesJobRow } from './salesJobTypes';

const ORDER_JOB_TYPES = new Set(['take_order', 'collect_payment', 'returns_pickup']);
const SHARED_PRODUCT_JOB_TYPES = new Set(['promote_product', 'stock_check', 'new_product_activation']);

function scheduleSignature(job: SalesJobRow): string {
  const rows = job.schedules?.length ? job.schedules : [{ date: job.scheduledDate, reminderTime: '07:00' }];
  return rows
    .map((row) => `${row.date}|${row.reminderTime || '07:00'}`)
    .sort()
    .join(',');
}

function splitKey(job: SalesJobRow): string {
  return `${job.jobType}|${job.priorityReason || ''}|${scheduleSignature(job)}`;
}

export function jobSkipsClient(jobType: string) {
  return jobType === 'competitor_intel';
}

export function clientIdsOf(job: SalesJobRow): string[] {
  if (jobSkipsClient(job.jobType)) return [];
  const ids = [...(job.clientIds ?? []), job.clientId || ''].map((id) => id.trim()).filter(Boolean);
  return Array.from(new Set(ids));
}

/** The old save created one row per client from a single order job. Only those rows fold back together. */
function isOldClientSplit(existing: SalesJobRow, job: SalesJobRow): boolean {
  const left = existing.clientId?.trim() || '';
  const right = job.clientId?.trim() || '';
  if (!left || !right || left === right) return false;
  if (existing.status !== job.status) return false;
  if (existing.status === 'completed' || job.status === 'completed') return false;
  return true;
}

function combineSplitOrderJobs(rows: SalesJobRow[]): SalesJobRow[] {
  const combined: SalesJobRow[] = [];
  for (const job of rows) {
    if (!ORDER_JOB_TYPES.has(job.jobType)) {
      combined.push(job);
      continue;
    }
    const key = splitKey(job);
    const existingIndex = combined.findIndex(
      (existing) => ORDER_JOB_TYPES.has(existing.jobType) && splitKey(existing) === key && isOldClientSplit(existing, job),
    );
    if (existingIndex === -1) {
      combined.push({ ...job, orderIds: [...(job.orderIds ?? [])] });
      continue;
    }
    const existing = combined[existingIndex];
    const orderIds = Array.from(
      new Set([...(existing.orderIds ?? []), ...(job.orderIds ?? []), existing.orderId || '', job.orderId || ''].filter(Boolean)),
    );
    combined[existingIndex] = { ...existing, orderIds, orderId: orderIds[0] ?? existing.orderId };
  }
  return combined;
}

function productSignature(job: SalesJobRow): string {
  return [...(job.suggestedProducts ?? [])].slice().sort().join(',');
}

/**
 * One card can hold buyers at different stages: one buyer counted, another still
 * pending, a third already sent the WhatsApp reminder. The card only counts as
 * completed when every buyer row is completed.
 */
function mergedCardStatus(a: string, b: string): string {
  if (a === b) return a;
  if (a === 'completed') return b;
  if (b === 'completed') return a;
  const pendingish = ['pending', 'approved', 'suggested'];
  if (pendingish.includes(a) || pendingish.includes(b)) return 'pending';
  return a;
}

/** Older saves stored one row per client. Same products fold back into one job. */
function combineSharedProductJobs(rows: SalesJobRow[]): SalesJobRow[] {
  const combined: SalesJobRow[] = [];
  for (const job of rows) {
    if (!SHARED_PRODUCT_JOB_TYPES.has(job.jobType)) {
      combined.push(job);
      continue;
    }
    const key = `${splitKey(job)}|${productSignature(job)}`;
    const existingIndex = combined.findIndex(
      (existing) =>
        SHARED_PRODUCT_JOB_TYPES.has(existing.jobType) &&
        `${splitKey(existing)}|${productSignature(existing)}` === key,
    );
    if (existingIndex === -1) {
      const clientIds = clientIdsOf(job);
      combined.push({ ...job, clientIds, clientId: clientIds[0] || job.clientId });
      continue;
    }
    const existing = combined[existingIndex];
    const clientIds = jobSkipsClient(job.jobType) ? [] : Array.from(new Set([...clientIdsOf(existing), ...clientIdsOf(job)]));
    combined[existingIndex] = {
      ...existing,
      clientIds,
      clientId: clientIds[0] || '',
      status: mergedCardStatus(existing.status, job.status),
    };
  }
  return combined;
}

/**
 * The job cards a user sees on the edit page: database rows that were split
 * per client or per order fold back into one card. Counts should use these
 * cards, not the raw rows.
 */
export function combineSalesJobCards(rows: SalesJobRow[]): SalesJobRow[] {
  return combineSharedProductJobs(combineSplitOrderJobs(rows));
}

/** Cards across the whole board. Combining never crosses a job list group. */
export function combineSalesJobCardsByListGroup(jobs: SalesJobRow[]): SalesJobRow[] {
  const groups = new Map<string, SalesJobRow[]>();
  for (const job of jobs) {
    const id = job.listGroupId?.trim() || `${job.assignedTo}::${job.clientId}`;
    const list = groups.get(id);
    if (list) list.push(job);
    else groups.set(id, [job]);
  }
  return Array.from(groups.values()).flatMap((rows) => combineSalesJobCards(rows));
}
