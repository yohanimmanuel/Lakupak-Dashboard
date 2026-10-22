import { prisma } from '@/lib/db';
import { salesJobTypeLabel, salesJobTypeLabelId } from '@/lib/salesJobs/whatsapp';

export type SalesReplyLocale = 'en' | 'id';

export type RepJobLine = {
  clientName: string;
  /** Shops on this line, when known. Lets grouped lines list every shop once. */
  shops?: string[];
  jobType: string;
  productNames: string[];
  reason?: string | null;
  done?: boolean;
};

const SHARED_PRODUCT_JOB_TYPES = new Set(['promote_product', 'stock_check', 'new_product_activation']);

/**
 * Stock checks are stored one row per buyer. Buyers that share a job type and
 * the same products are one task for the rep, so they become one line listing
 * every shop. A different product set stays its own line.
 */
export function groupJobLines(locale: SalesReplyLocale, jobs: RepJobLine[]): RepJobLine[] {
  const grouped: { key: string | null; line: RepJobLine; shops: string[]; allDone: boolean }[] = [];
  for (const job of jobs) {
    const shops = (job.shops?.length ? job.shops : [job.clientName]).map((shop) => shop.trim()).filter(Boolean);
    const key = SHARED_PRODUCT_JOB_TYPES.has(job.jobType)
      ? [
          job.jobType,
          job.productNames.map((name) => name.trim().toLowerCase()).sort().join('|'),
          job.reason?.trim() ?? '',
          job.done ? 'done' : 'open',
        ].join('::')
      : null;
    const existing = key ? grouped.find((row) => row.key === key) : undefined;
    if (!existing) {
      grouped.push({ key, line: job, shops, allDone: Boolean(job.done) });
      continue;
    }
    for (const shop of shops) {
      if (!existing.shops.some((row) => row.toLowerCase() === shop.toLowerCase())) existing.shops.push(shop);
    }
    existing.allDone = existing.allDone && Boolean(job.done);
  }
  return grouped.map(({ key, line, shops, allDone }) =>
    key ? { ...line, shops, clientName: joinShopNames(locale, shops), done: allDone } : line,
  );
}

export function asSalesReplyLocale(value: unknown): SalesReplyLocale | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'id' || raw === 'en') return raw;
  return null;
}

function languageOnAction(agentConfig: unknown, catalogType: string): SalesReplyLocale | null {
  const root = agentConfig as {
    __canvas?: { nodes?: Array<{ data?: { catalogType?: string; config?: { csReplyLanguage?: unknown } } }> };
  } | null;
  const nodes = root?.__canvas?.nodes;
  if (!Array.isArray(nodes)) return null;
  for (const node of nodes) {
    if (node?.data?.catalogType !== catalogType) continue;
    const locale = asSalesReplyLocale(node.data.config?.csReplyLanguage);
    if (locale) return locale;
  }
  return null;
}

/** Same rule as buyer WhatsApp: one configured reply language, never both. */
export async function salesRepReplyLocale(distributorId: number): Promise<SalesReplyLocale> {
  const workflows = await prisma.automationWorkflow.findMany({
    where: { userId: distributorId, status: 'active' },
    select: { agentConfig: true },
  });
  let sales: SalesReplyLocale | null = null;
  let buyer: SalesReplyLocale | null = null;
  for (const workflow of workflows) {
    sales = sales ?? languageOnAction(workflow.agentConfig, 'assign_sales_job');
    buyer = buyer ?? languageOnAction(workflow.agentConfig, 'cs_24h_window');
  }
  return sales ?? buyer ?? 'en';
}

export function salesCopy(locale: SalesReplyLocale, en: string, id: string): string {
  return locale === 'id' ? id : en;
}

export function jobTypeLabel(locale: SalesReplyLocale, jobType: string): string {
  return locale === 'id' ? salesJobTypeLabelId(jobType) : salesJobTypeLabel(jobType);
}

export function jobListBody(locale: SalesReplyLocale, jobs: RepJobLine[]): string {
  return groupJobLines(locale, jobs)
    .map((job, index) => {
      const store = job.clientName.trim() || (locale === 'id' ? 'Toko' : 'Shop');
      const type = jobTypeLabel(locale, job.jobType);
      const products = job.productNames.map((item) => item.trim()).filter(Boolean);
      const parts = [`${index + 1}. ${store}`, type];
      if (products.length) {
        parts.push(locale === 'id' ? `Produk: ${products.join(', ')}` : `Products: ${products.join(', ')}`);
      }
      const reason = job.reason?.trim();
      if (reason) parts.push(reason);
      if (job.done) parts.push(locale === 'id' ? 'Selesai' : 'Done');
      return parts.join('\n');
    })
    .join('\n\n');
}

export function upcomingJobsMessage(locale: SalesReplyLocale, agentName: string, jobs: RepJobLine[]): string {
  const name = agentName.trim() || (locale === 'id' ? 'Sales' : 'there');
  const greeting = locale === 'id' ? `Hai ${name}.` : `Hi ${name}.`;
  const intro = locale === 'id' ? 'Berikut pekerjaan mendatang Anda:' : 'Here are your upcoming jobs:';
  const close =
    locale === 'id'
      ? 'Balas saja kalau mau tanya soal pekerjaan ini, produknya, atau penjualan Anda. Kalau ada yang sudah selesai, beri tahu saya.'
      : 'Reply if you want to ask about these jobs, the products, or your sales. If one is finished, tell me.';
  return [greeting, intro, jobListBody(locale, jobs), close].join('\n\n');
}

/** Same numbered list as the outbound reminder, without the greeting. Finished jobs are marked done. */
export function remainingJobsMessage(locale: SalesReplyLocale, jobs: RepJobLine[]): string {
  if (jobs.length === 0) {
    return salesCopy(
      locale,
      "That's everything for today. Send a message if you want to ask something.",
      'Untuk hari ini sudah selesai. Balas saja kalau ada yang mau ditanya.',
    );
  }
  const intro = locale === 'id' ? 'Berikut pekerjaan Anda:' : 'Here are your jobs:';
  return [intro, jobListBody(locale, jobs)].join('\n\n');
}

export function reportButtonTitles(locale: SalesReplyLocale): [string, string, string] {
  return locale === 'id' ? ['Ada pesanan', 'Tidak ada order', 'Jadwal ulang'] : ['Order placed', 'No order', 'Reschedule'];
}

export function reportButtonPrompt(locale: SalesReplyLocale, store: string): string {
  return locale === 'id'
    ? `Laporkan pekerjaan yang selesai untuk ${store}.`
    : `Report the finished job for ${store}.`;
}

export function nameTheFinishedWork(locale: SalesReplyLocale): string {
  return salesCopy(
    locale,
    'Tell me the finished work in your own words, such as the promotion or the delivery, and I will update that checklist.',
    'Sebut pekerjaan yang sudah selesai, misalnya promosi atau pengantaran, supaya saya update checklist-nya.',
  );
}

export function joinShopNames(locale: SalesReplyLocale, shops: string[]): string {
  const names = Array.from(new Set(shops.map((shop) => shop.trim()).filter(Boolean)));
  if (names.length === 0) return locale === 'id' ? 'toko ini' : 'this shop';
  if (names.length === 1) return names[0];
  const last = names[names.length - 1];
  const head = names.slice(0, -1);
  const joiner = locale === 'id' ? ' dan ' : ' and ';
  if (head.length === 1) return `${head[0]}${joiner}${last}`;
  return `${head.join(', ')}${joiner}${last}`;
}

export function competitorHeardReply(
  locale: SalesReplyLocale,
  shop: string,
  heard: { name: string; product: string; price: string; promo: string },
  corrected = false,
): string {
  const store = shop.trim() || (locale === 'id' ? 'toko itu' : 'that shop');
  const close = corrected
    ? salesCopy(locale, 'I corrected that.', 'Sudah saya betulkan.')
    : salesCopy(locale, 'I saved that.', 'Sudah saya catat.');
  return salesCopy(
    locale,
    `Got it. At ${store}, the competitor is ${heard.name}, the product is ${heard.product}, the price is about ${heard.price}, and the promo is ${heard.promo}. ${close}`,
    `Oke. Di ${store}, pesaingnya ${heard.name}, produknya ${heard.product}, harganya sekitar ${heard.price}, dan promonya ${heard.promo}. ${close}`,
  );
}

export function quantityHeardReply(locale: SalesReplyLocale, shop: string, lines: string[], corrected = false): string {
  const store = shop.trim() || (locale === 'id' ? 'toko itu' : 'that shop');
  const list = joinShopNames(locale, lines);
  const close = corrected
    ? salesCopy(locale, 'I corrected that.', 'Sudah saya betulkan.')
    : salesCopy(locale, 'I saved that.', 'Sudah saya catat.');
  return salesCopy(locale, `Got it. At ${store}, ${list}. ${close}`, `Oke. Di ${store}, ${list}. ${close}`);
}

export function checklistUpdatedReply(locale: SalesReplyLocale, store: string, jobType: string): string {
  const shop = store.trim() || (locale === 'id' ? 'toko ini' : 'this shop');
  const type = jobTypeLabel(locale, jobType);
  return salesCopy(
    locale,
    `Got it. I updated the ${type} checklist for ${shop}.`,
    `Baik. Checklist ${type} untuk ${shop} sudah saya update.`,
  );
}

export function stockCountAsk(locale: SalesReplyLocale, shop: string, missing: string[], noted: string[]): string {
  const store = shop.trim() || (locale === 'id' ? 'toko ini' : 'this shop');
  const left = joinShopNames(locale, missing);
  const example = missing
    .slice(0, 2)
    .map((name, index) => `${name} ${index === 0 ? 12 : 4}`)
    .join(', ');
  const waiting = salesCopy(
    locale,
    `For ${store}, enter the counted stock for ${left}. For example: ${example}.`,
    `Untuk ${store}, isi stok terhitung untuk ${left}. Contoh: ${example}.`,
  );
  if (noted.length === 0) return waiting;
  const done = joinShopNames(locale, noted);
  return salesCopy(locale, `Got it. I noted ${done}. ${waiting}`, `Baik. ${done} saya catat. ${waiting}`);
}

export function activationQtyAsk(locale: SalesReplyLocale, shop: string, missing: string[], noted: string[]): string {
  const store = shop.trim() || (locale === 'id' ? 'toko ini' : 'this shop');
  const names = joinShopNames(locale, missing);
  const waiting =
    missing.length === 0
      ? salesCopy(locale, `For ${store}, how many products were given?`, `Untuk ${store}, berapa produk yang diberikan?`)
      : salesCopy(
          locale,
          `For ${store}, how many products were given for ${names}?`,
          `Untuk ${store}, berapa produk yang diberikan untuk ${names}?`,
        );
  if (noted.length === 0) return waiting;
  const done = joinShopNames(locale, noted);
  return salesCopy(locale, `Got it. I noted ${done}. ${waiting}`, `Baik. ${done} saya catat. ${waiting}`);
}

const COMPETITOR_FIELD_LABEL = {
  name: { en: 'Competitor name', id: 'Nama pesaing' },
  product: { en: 'Competitor product', id: 'Produk pesaing' },
  price: { en: 'Observed price', id: 'Harga yang terlihat' },
  promo: { en: 'Observed promo', id: 'Promo yang terlihat' },
} as const;

export type CompetitorField = keyof typeof COMPETITOR_FIELD_LABEL;

export function competitorInputAsk(
  locale: SalesReplyLocale,
  shop: string,
  missing: CompetitorField[],
  noted: string[],
): string {
  const store = shop.trim() || (locale === 'id' ? 'toko ini' : 'this shop');
  const left = joinShopNames(
    locale,
    missing.map((field) => COMPETITOR_FIELD_LABEL[field][locale === 'id' ? 'id' : 'en']),
  );
  const waiting = salesCopy(
    locale,
    `For ${store}, list the competitor check: ${left}.`,
    `Untuk ${store}, sebut hasil cek kompetitor: ${left}.`,
  );
  if (noted.length === 0) return waiting;
  const done = joinShopNames(locale, noted);
  return salesCopy(locale, `Got it. I noted ${done}. ${waiting}`, `Baik. ${done} saya catat. ${waiting}`);
}

export function buyersStillOpenReply(
  locale: SalesReplyLocale,
  jobType: string,
  noted: string[],
  remaining: string[],
): string {
  const left = joinShopNames(locale, remaining);
  const type = jobTypeLabel(locale, jobType);
  const verb = remaining.length > 1 ? 'are' : 'is';
  const waiting = salesCopy(
    locale,
    `${type} stays open until ${left} ${verb} finished too.`,
    `${type} belum selesai sampai ${left} juga selesai.`,
  );
  if (noted.length === 0) return waiting;
  const done = joinShopNames(locale, noted);
  return salesCopy(locale, `Got it. I noted ${done}. ${waiting}`, `Baik. ${done} saya catat. ${waiting}`);
}

export function wantsFinishedJobReport(text: string): boolean {
  return /\b(laporan|lapor|report|finish the job|job is finished|sudah selesai|pekerjaan selesai|kunjungan selesai|mark complete|tombol laporan)\b/i.test(
    text,
  );
}
