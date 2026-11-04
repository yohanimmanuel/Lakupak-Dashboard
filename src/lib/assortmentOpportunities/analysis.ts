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

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

const SIGNAL_COPY: Record<AnalysisKind, { en: string; id: string; enPoint: string; idPoint: string }> = {
  categoryAffinity: {
    en: 'Category affinity',
    id: 'Kecocokan kategori',
    enPoint: 'These retailers have ordered this category more than once.',
    idPoint: 'Toko-toko ini sudah memesan kategori ini lebih dari sekali.',
  },
  coPurchase: {
    en: 'Product association',
    id: 'Asosiasi produk',
    enPoint: 'These retailers buy a competing product in the same category and pack size.',
    idPoint: 'Toko-toko ini membeli produk pesaing di kategori dan ukuran kemasan yang sama.',
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
    enPoint: 'These retailers have a reorder rhythm in the category.',
    idPoint: 'Toko-toko ini punya ritme pesan ulang di kategori tersebut.',
  },
  priceSuitability: {
    en: 'Price suitability',
    id: 'Kesesuaian harga',
    enPoint: 'The price is compared with what these retailers already pay in the category.',
    idPoint: 'Harga dibandingkan dengan yang biasa dibayar toko-toko ini di kategori tersebut.',
  },
};

function factualCards(facts: Facts, localeId: boolean): AnalysisCard[] {
  const retailerWord = (count: number) =>
    countLabel(count, localeId ? 'toko' : 'retailer', localeId ? 'toko' : 'retailers');
  const productWord = (count: number) =>
    countLabel(count, localeId ? 'produk' : 'product', localeId ? 'produk' : 'products');

  return facts.signals.map((signal) => {
    const copy = SIGNAL_COPY[signal.key];
    const basis = localeId
      ? `${retailerWord(signal.retailers)} dan ${productWord(signal.products)}`
      : `${retailerWord(signal.retailers)} and ${productWord(signal.products)}`;
    const points = [localeId ? copy.idPoint : copy.enPoint];
    if (signal.key === 'priceSuitability') {
      const compared = signal.insideRange + signal.outsideRange;
      if (compared > 0) {
        const insideShare = Math.round((signal.insideRange / compared) * 100);
        points.push(
          localeId
            ? `${insideShare}% dari kecocokan ini berada di kisaran harga yang sudah dibayar toko.`
            : `${insideShare}% of these matches sit inside the prices those retailers already pay.`,
        );
      }
    }
    return {
      title: localeId ? copy.id : copy.en,
      kind: signal.key,
      metricValue: String(signal.matches),
      metricLabel: localeId ? `kecocokan pada ${basis}` : `matches on ${basis}`,
      points,
      body: points.join(' '),
    };
  });
}

export async function buildAssortmentAnalysis(distributorId: number, locale: string): Promise<{
  cards: AnalysisCard[];
  source: 'ai' | 'rules';
  metrics: { label: string; value: string; hint: string }[];
}> {
  const facts = await assortmentAnalysisFacts(distributorId);
  const localeId = locale.toLowerCase().startsWith('id');
  const cards = factualCards(facts, localeId);
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

  return { cards, source: 'rules', metrics };
}
