import { prisma } from '@/lib/db';
import { salesJobTypeLabel, salesJobTypeLabelId } from '@/lib/salesJobs/whatsapp';

export type SalesReplyLocale = 'en' | 'id';

export type RepJobLine = {
  clientName: string;
  jobType: string;
  productNames: string[];
  reason?: string | null;
};

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

export function upcomingJobsMessage(locale: SalesReplyLocale, agentName: string, jobs: RepJobLine[]): string {
  const name = agentName.trim() || (locale === 'id' ? 'Sales' : 'there');
  const greeting = locale === 'id' ? `Hai ${name}.` : `Hi ${name}.`;
  const intro = locale === 'id' ? 'Berikut pekerjaan mendatang Anda:' : 'Here are your upcoming jobs:';
  const lines = jobs.map((job, index) => {
    const store = job.clientName.trim() || (locale === 'id' ? 'Toko' : 'Shop');
    const type = jobTypeLabel(locale, job.jobType);
    const products = job.productNames.map((item) => item.trim()).filter(Boolean);
    const parts = [`${index + 1}. ${store}`, type];
    if (products.length) {
      parts.push(locale === 'id' ? `Produk: ${products.join(', ')}` : `Products: ${products.join(', ')}`);
    }
    const reason = job.reason?.trim();
    if (reason) parts.push(reason);
    return parts.join('\n');
  });
  const close =
    locale === 'id'
      ? 'Balas saja kalau mau tanya soal pekerjaan ini, produknya, atau penjualan Anda. Kalau ada yang sudah selesai, beri tahu saya.'
      : 'Reply if you want to ask about these jobs, the products, or your sales. If one is finished, tell me.';
  return [greeting, intro, ...lines, close].join('\n\n');
}

export function reportButtonTitles(locale: SalesReplyLocale): [string, string, string] {
  return locale === 'id' ? ['Ada pesanan', 'Tidak ada order', 'Jadwal ulang'] : ['Order placed', 'No order', 'Reschedule'];
}

export function reportButtonPrompt(locale: SalesReplyLocale, store: string): string {
  return locale === 'id'
    ? `Laporkan pekerjaan yang selesai untuk ${store}.`
    : `Report the finished job for ${store}.`;
}

export function whichJobPrompt(locale: SalesReplyLocale, shops: string[]): string {
  const list = shops.map((shop, index) => `${index + 1}. ${shop}`).join('\n');
  return locale === 'id'
    ? `Pekerjaan yang mana yang sudah selesai? Balas dengan nomornya.\n${list}`
    : `Which finished job should I open the report for? Reply with the number.\n${list}`;
}

export function wantsFinishedJobReport(text: string): boolean {
  return /\b(laporan|lapor|report|finish the job|job is finished|sudah selesai|pekerjaan selesai|kunjungan selesai|mark complete|tombol laporan)\b/i.test(
    text,
  );
}
