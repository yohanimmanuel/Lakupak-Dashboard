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
type SignalFact = Facts['signals'][number];
type SignalExample = SignalFact['examples'][number];

const MAX_POINTS = 4;

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatCategory(slug: string | null | undefined, localeId: boolean): string {
  const cleaned = slug?.trim().replace(/[_-]+/g, ' ');
  if (!cleaned) return localeId ? 'kategori ini' : 'this category';
  return cleaned;
}

const SIGNAL_TITLES: Record<AnalysisKind, { en: string; id: string }> = {
  categoryAffinity: { en: 'Category affinity', id: 'Kecocokan kategori' },
  coPurchase: { en: 'Product association', id: 'Asosiasi produk' },
  segmentFit: { en: 'Segment fit', id: 'Kecocokan segmen' },
  purchasingActivity: { en: 'Purchasing activity', id: 'Aktivitas pembelian' },
  priceSuitability: { en: 'Price suitability', id: 'Kesesuaian harga' },
};

function pushUnique(points: string[], next: string | null | undefined) {
  const cleaned = next?.trim();
  if (!cleaned || points.length >= MAX_POINTS) return;
  if (points.some((point) => point.toLowerCase() === cleaned.toLowerCase())) return;
  points.push(cleaned);
}

function exampleLine(example: SignalExample, kind: AnalysisKind, localeId: boolean): string {
  const product = example.productName.trim() || (localeId ? 'Produk ini' : 'This product');
  const retailer = example.retailerName.trim() || (localeId ? 'toko ini' : 'this retailer');
  const category = formatCategory(example.categorySlug, localeId);
  const segment = example.segment.trim() || (localeId ? 'toko' : 'shop');

  switch (kind) {
    case 'categoryAffinity':
      return localeId
        ? `${product} di ${category} cocok ke ${retailer} karena toko itu sudah pesan ulang kategori tersebut.`
        : `${product} in ${category} matches ${retailer} because that store already reorders the category.`;
    case 'coPurchase':
      return localeId
        ? `${product} cocok ke ${retailer}: toko itu sudah beli pesaing seukuran di ${category}.`
        : `${product} matches ${retailer}: they already buy a same-size rival in ${category}.`;
    case 'segmentFit':
      return localeId
        ? `${product} cocok ke ${retailer} (${segment}) karena jenis toko ini sudah beli ${category}.`
        : `${product} matches ${retailer} (${segment}) because that shop type already buys ${category}.`;
    case 'purchasingActivity':
      return localeId
        ? `${product} cocok ke ${retailer} karena ritme beli ${category} mereka masih aktif.`
        : `${product} matches ${retailer} because their ${category} buying rhythm is still active.`;
    case 'priceSuitability':
      if (example.reason === 'price_within_range') {
        return localeId
          ? `Harga ${product} untuk ${retailer} masuk kisaran yang sudah mereka bayar di ${category}.`
          : `${product} pricing for ${retailer} sits inside what they already pay in ${category}.`;
      }
      if (example.reason === 'price_outside_range') {
        return localeId
          ? `Harga ${product} untuk ${retailer} di luar kisaran yang sudah mereka bayar di ${category}.`
          : `${product} pricing for ${retailer} sits outside what they already pay in ${category}.`;
      }
      return localeId
        ? `Harga ${product} untuk ${retailer} dibandingkan dengan yang sudah mereka bayar di ${category}.`
        : `${product} pricing for ${retailer} is compared with what they already pay in ${category}.`;
  }
}

function buildSignalPoints(signal: SignalFact, localeId: boolean): string[] {
  const points: string[] = [];
  const example = signal.examples[0] ?? null;
  const category = formatCategory(signal.topCategory, localeId);
  const retailers = countLabel(
    signal.retailers,
    localeId ? 'toko' : 'retailer',
    localeId ? 'toko' : 'retailers',
  );
  const products = countLabel(
    signal.products,
    localeId ? 'produk' : 'product',
    localeId ? 'produk' : 'products',
  );
  const enMatches = (count: number) => countLabel(count, 'match', 'matches');
  const enVerb = (count: number, singular: string, plural: string) =>
    count === 1 ? singular : plural;

  switch (signal.key) {
    case 'categoryAffinity': {
      pushUnique(
        points,
        localeId
          ? `Menangkap toko yang sudah pesan ulang kategori yang sama, bukan sekali beli.`
          : `Catches stores that already reorder the same category, not one-off buyers.`,
      );
      if (signal.topCategory && signal.topCategoryMatches > 0) {
        pushUnique(
          points,
          localeId
            ? `${signal.topCategoryMatches} dari ${signal.matches} kecocokan ini mengarah ke ${category}.`
            : `${signal.topCategoryMatches} of these ${enMatches(signal.matches)} ${enVerb(signal.topCategoryMatches, 'points', 'point')} to ${category}.`,
        );
      }
      if (signal.strongScores > 0) {
        pushUnique(
          points,
          localeId
            ? `${signal.strongScores} kecocokan punya afinitas kuat (skor ≥ 80) di ${retailers}.`
            : `${enMatches(signal.strongScores)} ${enVerb(signal.strongScores, 'shows', 'show')} strong affinity (score ≥ 80) across ${retailers}.`,
          );
      } else if (signal.averageScore != null) {
        pushUnique(
          points,
          localeId
            ? `Kekuatan afinitas rata-rata di ${retailers}: skor ${signal.averageScore}.`
            : `Average affinity strength across ${retailers}: score ${signal.averageScore}.`,
        );
      }
      if (example) pushUnique(points, exampleLine(example, 'categoryAffinity', localeId));
      break;
    }
    case 'coPurchase': {
      pushUnique(
        points,
        localeId
          ? `Mencari peluang substitusi: toko sudah beli kemasan pesaing seukuran.`
          : `Looks for substitution chances: the store already buys a same-size rival pack.`,
      );
      pushUnique(
        points,
        localeId
          ? `${products} bisa ditawarkan sebagai alternatif di ${retailers} yang sudah beli pesaing.`
          : `${products} ${enVerb(signal.products, 'can be offered as an alternative', 'can be offered as alternatives')} at ${retailers} already buying rivals.`,
      );
      if (signal.topCategory && signal.topCategoryMatches > 0) {
        pushUnique(
          points,
          localeId
            ? `Persaingan paling terlihat di ${category} (${signal.topCategoryMatches} kecocokan).`
            : `Rival buying shows up most in ${category} (${enMatches(signal.topCategoryMatches)}).`,
        );
      }
      if (example) pushUnique(points, exampleLine(example, 'coPurchase', localeId));
      break;
    }
    case 'segmentFit': {
      const segment = signal.topSegment?.trim() || (localeId ? 'segmen toko' : 'shop segment');
      pushUnique(
        points,
        localeId
          ? `Mencocokkan produk ke jenis toko yang kategori tersebut sudah laku.`
          : `Fits products to shop types where that category already sells.`,
      );
      if (signal.topSegment && signal.topSegmentMatches > 0) {
        pushUnique(
          points,
          localeId
            ? `${segment} mendominasi sinyal ini: ${signal.topSegmentMatches} kecocokan.`
            : `${segment} leads this signal with ${enMatches(signal.topSegmentMatches)}.`,
        );
      }
      pushUnique(
        points,
        localeId
          ? `${products} masuk ke ${retailers} karena segmen toko mereka sudah beli kategori itu.`
          : `${products} ${enVerb(signal.products, 'reaches', 'reach')} ${retailers} because their shop segment already buys the category.`,
      );
      if (example) pushUnique(points, exampleLine(example, 'segmentFit', localeId));
      break;
    }
    case 'purchasingActivity': {
      pushUnique(
        points,
        localeId
          ? `Mengukur apakah ritme beli kategori masih hidup, bukan hanya sejarah lama.`
          : `Checks whether category buying rhythm is still alive, not only old history.`,
      );
      pushUnique(
        points,
        localeId
          ? `${retailers} masih aktif di kategori, membuka peluang untuk ${products}.`
          : `${retailers} ${enVerb(signal.retailers, 'is', 'are')} still active in-category, opening room for ${products}.`,
      );
      if (signal.averageScore != null) {
        pushUnique(
          points,
          localeId
            ? `Kekuatan ritme beli rata-rata: skor ${signal.averageScore}.`
            : `Average buying-rhythm strength: score ${signal.averageScore}.`,
        );
      } else if (signal.topCategory) {
        pushUnique(
          points,
          localeId
            ? `Aktivitas terbaru paling sering terlihat di ${category}.`
            : `Recent activity shows up most often in ${category}.`,
        );
      }
      if (example) pushUnique(points, exampleLine(example, 'purchasingActivity', localeId));
      break;
    }
    case 'priceSuitability': {
      const compared = signal.insideRange + signal.outsideRange;
      pushUnique(
        points,
        localeId
          ? `Membandingkan harga SKU dengan kisaran yang sudah dibayar toko di kategori itu.`
          : `Compares the SKU price with what stores already pay in that category.`,
      );
      if (compared > 0) {
        const insideShare = Math.round((signal.insideRange / compared) * 100);
        pushUnique(
          points,
          localeId
            ? `${insideShare}% kecocokan harganya masuk kisaran yang sudah dibayar (${signal.insideRange}/${compared}).`
            : `${insideShare}% of ${enMatches(compared)} ${enVerb(compared, 'sits', 'sit')} inside paid price ranges (${signal.insideRange}/${compared}).`,
        );
        if (signal.outsideRange > 0) {
          pushUnique(
            points,
            localeId
              ? `${signal.outsideRange} kecocokan di luar kisaran — perlu dicek harga atau promo.`
              : `${enMatches(signal.outsideRange)} ${enVerb(signal.outsideRange, 'sits', 'sit')} outside the range — check price or promo.`,
          );
        }
      } else if (signal.topCategory) {
        pushUnique(
          points,
          localeId
            ? `Acuan harga paling sering diambil dari pembelian di ${category}.`
            : `Price references most often come from purchases in ${category}.`,
        );
      }
      if (example) pushUnique(points, exampleLine(example, 'priceSuitability', localeId));
      break;
    }
  }

  return points.slice(0, MAX_POINTS);
}

function factualCards(facts: Facts, localeId: boolean): AnalysisCard[] {
  const retailerWord = (count: number) =>
    countLabel(count, localeId ? 'toko' : 'retailer', localeId ? 'toko' : 'retailers');
  const productWord = (count: number) =>
    countLabel(count, localeId ? 'produk' : 'product', localeId ? 'produk' : 'products');

  return facts.signals.map((signal) => {
    const title = SIGNAL_TITLES[signal.key];
    const basis = localeId
      ? `${retailerWord(signal.retailers)} dan ${productWord(signal.products)}`
      : `${retailerWord(signal.retailers)} and ${productWord(signal.products)}`;
    const points = buildSignalPoints(signal, localeId);
    return {
      title: localeId ? title.id : title.en,
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
