import { chatWithOpenRouter, isOpenRouterConfigured } from '@/lib/automations/openrouter';
import { assortmentAnalysisFacts } from '@/lib/assortmentOpportunities/service';

export type AnalysisKind =
  | 'categoryAffinity'
  | 'coPurchase'
  | 'segmentFit'
  | 'purchasingActivity'
  | 'priceSuitability';

export type AnalysisCard = {
  title: string;
  body: string;
  points: string[];
  kind: AnalysisKind;
  metricValue: string;
  metricLabel: string;
};

type Facts = Awaited<ReturnType<typeof assortmentAnalysisFacts>>;

const EVIDENCE_EN: Record<string, string> = {
  never_purchased: 'This retailer has never bought this exact SKU.',
  outside_lookback: 'There is no recent purchase of this SKU.',
  overdue_reorder: 'This retailer bought this SKU before and is past the usual reorder time.',
  bought_this_sku: 'This retailer has bought this SKU.',
  buys_other_variant: 'This retailer already buys another size or flavour in the same product family.',
  buys_same_brand: 'This retailer already buys other products from the same brand.',
  buys_same_category: 'This retailer already buys other products in the same category.',
  repeated_category: 'This retailer has ordered this category more than once.',
  no_category_overlap: 'This retailer has no purchases in this category.',
  co_purchase: 'Other products this retailer buys are often bought together with this SKU.',
  competing_products: 'This retailer buys competing products in the same category.',
  segment_fit: 'Other shops of this type already buy this SKU.',
  segment_buys_category: 'Shops of this type already buy this category.',
  recent_orders: 'This retailer has placed orders recently.',
  regular_category_orders: 'This retailer orders this category on a regular cycle.',
  price_within_range: 'The price sits inside what this retailer already pays.',
  price_outside_range: 'The price sits outside what this retailer usually pays.',
  price_above_usual: 'The price is higher than what this retailer usually pays.',
  shares_flavour: 'A product they already buy has the same flavour.',
  shares_size: 'A product they already buy has the same pack size.',
  shares_packaging: 'A product they already buy uses the same packaging.',
};

const EVIDENCE_ID: Record<string, string> = {
  never_purchased: 'Toko ini belum pernah membeli SKU ini.',
  outside_lookback: 'Tidak ada pembelian SKU ini baru-baru ini.',
  overdue_reorder: 'Toko ini pernah membeli SKU ini dan sudah lewat waktu pesan ulang yang biasa.',
  bought_this_sku: 'Toko ini pernah membeli SKU ini.',
  buys_other_variant: 'Toko ini sudah membeli ukuran atau rasa lain dari keluarga produk yang sama.',
  buys_same_brand: 'Toko ini sudah membeli produk lain dari merek yang sama.',
  buys_same_category: 'Toko ini sudah membeli produk lain dalam kategori yang sama.',
  repeated_category: 'Toko ini sudah memesan kategori ini lebih dari sekali.',
  no_category_overlap: 'Toko ini belum membeli apa pun di kategori ini.',
  co_purchase: 'Produk lain yang dibeli toko ini sering dibeli bersama SKU ini.',
  competing_products: 'Toko ini membeli produk pesaing dalam kategori yang sama.',
  segment_fit: 'Toko dengan jenis yang sama sudah membeli SKU ini.',
  segment_buys_category: 'Jenis toko ini sudah membeli kategori ini.',
  recent_orders: 'Toko ini baru saja membuat pesanan.',
  regular_category_orders: 'Toko ini memesan kategori ini secara rutin.',
  price_within_range: 'Harganya masuk dalam kisaran yang biasa dibayar toko ini.',
  price_outside_range: 'Harganya di luar kisaran yang biasa dibayar toko ini.',
  price_above_usual: 'Harganya lebih tinggi dari yang biasa dibayar toko ini.',
  shares_flavour: 'Produk yang sudah mereka beli punya rasa yang sama.',
  shares_size: 'Produk yang sudah mereka beli punya ukuran kemasan yang sama.',
  shares_packaging: 'Produk yang sudah mereka beli memakai kemasan yang sama.',
};

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

const SIGNAL_COPY: Record<AnalysisKind, { en: string; id: string; enPoint: string; idPoint: string }> = {
  categoryAffinity: {
    en: 'Category affinity',
    id: 'Kecocokan kategori',
    enPoint: 'The retailer has ordered this category more than once.',
    idPoint: 'Toko sudah memesan kategori ini lebih dari sekali.',
  },
  coPurchase: {
    en: 'Product association',
    id: 'Asosiasi produk',
    enPoint: 'The retailer buys a competing product in the same category and pack size.',
    idPoint: 'Toko membeli produk pesaing di kategori dan ukuran kemasan yang sama.',
  },
  segmentFit: {
    en: 'Segment fit',
    id: 'Kecocokan segmen',
    enPoint: 'This shop type already buys the category.',
    idPoint: 'Jenis toko ini sudah membeli kategori tersebut.',
  },
  purchasingActivity: {
    en: 'Purchasing activity',
    id: 'Aktivitas pembelian',
    enPoint: 'The retailer has a reorder rhythm in the category.',
    idPoint: 'Toko punya ritme pesan ulang di kategori tersebut.',
  },
  priceSuitability: {
    en: 'Price suitability',
    id: 'Kesesuaian harga',
    enPoint: 'The price is compared with what this retailer already pays in the category.',
    idPoint: 'Harga dibandingkan dengan yang biasa dibayar toko ini di kategori tersebut.',
  },
};

function factualCards(facts: Facts, localeId: boolean): AnalysisCard[] {
  const retailerWord = (count: number) =>
    countLabel(count, localeId ? 'toko' : 'retailer', localeId ? 'toko' : 'retailers');
  const productWord = (count: number) =>
    countLabel(count, localeId ? 'produk' : 'product', localeId ? 'produk' : 'products');

  return facts.signals.map((signal) => {
    const copy = SIGNAL_COPY[signal.key];
    const scorePoint = signal.averageScore == null
      ? (localeId ? 'Belum ada skor untuk sinyal ini' : 'No score for this signal yet')
      : (localeId ? `Skor rata-rata sinyal ${signal.averageScore}` : `Average signal score is ${signal.averageScore}`);
    const points = localeId
      ? [
          `Bobot pada skor kecocokan: ${signal.weight}`,
          `${signal.matches} dari ${facts.openMatches} kecocokan memakai sinyal ini`,
          `${retailerWord(signal.retailers)} dan ${productWord(signal.products)}`,
          copy.idPoint,
          scorePoint,
          ...(signal.key === 'priceSuitability'
            ? [`${signal.insideRange} masuk kisaran harga, ${signal.outsideRange} di luar kisaran`]
            : []),
        ]
      : [
          `Weight in the match score: ${signal.weight}`,
          `${signal.matches} of ${facts.openMatches} matches include this signal`,
          `${retailerWord(signal.retailers)} and ${productWord(signal.products)}`,
          copy.enPoint,
          scorePoint,
          ...(signal.key === 'priceSuitability'
            ? [`${signal.insideRange} sit inside the prices already paid, ${signal.outsideRange} sit outside`]
            : []),
        ];
    return {
      title: localeId ? copy.id : copy.en,
      kind: signal.key,
      metricValue: String(signal.matches),
      metricLabel: localeId ? `dari ${facts.openMatches} kecocokan` : `of ${facts.openMatches} matches`,
      points,
      body: points.join(' '),
    };
  });
}

function humanizeCodes(text: string, localeId: boolean): string {
  const dictionary = localeId ? EVIDENCE_ID : EVIDENCE_EN;
  return text.replace(/\b[a-z]+(?:_[a-z]+)+\b/g, (code) => dictionary[code] ?? code.replace(/_/g, ' '));
}

function parseCards(content: string, localeId: boolean): AnalysisCard[] | null {
  const trimmed = content.trim().replace(/^```json\s*|```$/g, '').trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const rows = Array.isArray(parsed) ? parsed : (parsed as { cards?: unknown }).cards;
    if (!Array.isArray(rows)) return null;
    const cards = rows
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const title = 'title' in row && typeof row.title === 'string' ? row.title.trim() : '';
        const rawPoints = 'points' in row && Array.isArray(row.points)
          ? row.points.filter((point): point is string => typeof point === 'string').map((point) => humanizeCodes(point.trim(), localeId)).filter(Boolean)
          : [];
        const body = 'body' in row && typeof row.body === 'string' ? humanizeCodes(row.body.trim(), localeId) : rawPoints.join(' ');
        const points = rawPoints.length > 0 ? rawPoints : body.split(/(?<=\.)\s+/).map((point) => point.trim()).filter(Boolean);
        const kindRaw = 'kind' in row && typeof row.kind === 'string' ? row.kind : '';
        const kind = (Object.keys(SIGNAL_COPY) as AnalysisKind[]).includes(kindRaw as AnalysisKind)
          ? (kindRaw as AnalysisKind)
          : null;
        if (!kind) return null;
        const metricValue = 'metricValue' in row && typeof row.metricValue === 'string' ? row.metricValue.trim() : '';
        const metricLabel = 'metricLabel' in row && typeof row.metricLabel === 'string' ? row.metricLabel.trim() : '';
        if (!title || points.length === 0 || !metricValue) return null;
        return { title, body, points, kind, metricValue, metricLabel };
      })
      .filter((row): row is AnalysisCard => Boolean(row));
    return cards.length > 0 ? cards : null;
  } catch {
    return null;
  }
}

export async function buildAssortmentAnalysis(distributorId: number, locale: string): Promise<{
  cards: AnalysisCard[];
  source: 'ai' | 'rules';
  metrics: { label: string; value: string; hint: string }[];
}> {
  const facts = await assortmentAnalysisFacts(distributorId);
  const localeId = locale.toLowerCase().startsWith('id');
  const fallback = factualCards(facts, localeId);
  const metrics = [
    {
      label: localeId ? 'Toko aktif' : 'Active retailers',
      value: String(facts.activeRetailers),
      hint: localeId ? 'Prospek tidak dihitung' : 'Prospects are not included',
    },
    {
      label: localeId ? 'Pesanan 90 hari' : 'Ordered in 90 days',
      value: String(facts.orderingRetailers),
      hint: localeId ? 'Satu pesanan selesai sudah dihitung' : 'One completed order is enough',
    },
    {
      label: localeId ? 'Kecocokan terbuka' : 'Open matches',
      value: String(facts.openMatches),
      hint: localeId ? 'Toko aktif saja' : 'Active retailers only',
    },
    {
      label: localeId ? 'Rata-rata kecocokan' : 'Average match',
      value: String(facts.averageMatch),
      hint: localeId ? 'Dari lima sinyal bobot' : 'Across the five weighted signals',
    },
  ];

  if (!isOpenRouterConfigured() || facts.openMatches === 0) {
    return { cards: fallback, source: 'rules', metrics };
  }

  try {
    const result = await chatWithOpenRouter({
      temperature: 0.2,
      maxTokens: 900,
      reasoning: false,
      messages: [
        {
          role: 'system',
          content:
            'You rewrite five catalogue-wide match cards. Return exactly one card per kind: categoryAffinity, coPurchase, segmentFit, purchasingActivity, priceSuitability. Keep each metricValue exactly as given. Each point is one short sentence and must keep the numbers from that card. Do not add a card per product or per retailer. Do not invent demand, revenue, or marketplace events. Return JSON: {"cards":[{"title":"","kind":"","metricValue":"","metricLabel":"","points":["",""]}]}',
        },
        {
          role: 'user',
          content: `Rewrite these cards in ${localeId ? 'Indonesian, using simple words' : 'English'}.\n\n${JSON.stringify(fallback)}`,
        },
      ],
    });
    const cards = parseCards(result.content, localeId);
    const accepted = acceptGroupedCards(cards, fallback);
    if (!accepted) return { cards: fallback, source: 'rules', metrics };
    return { cards: accepted, source: 'ai', metrics };
  } catch {
    return { cards: fallback, source: 'rules', metrics };
  }
}

function acceptGroupedCards(cards: AnalysisCard[] | null, fallback: AnalysisCard[]): AnalysisCard[] | null {
  if (!cards || cards.length !== fallback.length) return null;
  const byKind = new Map(cards.map((card) => [card.kind, card]));
  const next: AnalysisCard[] = [];
  for (const base of fallback) {
    const card = byKind.get(base.kind);
    if (!card || card.metricValue !== base.metricValue || card.points.length === 0) return null;
    next.push({ ...base, points: card.points, body: card.points.join(' ') });
  }
  return next;
}
