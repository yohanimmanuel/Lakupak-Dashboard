import { createHash } from 'crypto';
import { prisma } from '@/lib/db';
import { searchPlacesText, type PlacesTextSearchPlace } from '@/lib/google/placesTextSearch';
import {
  isProspectBuyerType,
  type ProspectBuyerType,
  PROSPECT_BUYER_TYPES,
} from '@/lib/salesJobs/prospectBuyerTypes';
import { createSalesProspect, type SalesProspect } from '@/lib/salesJobs/prospects';
import {
  embedProspectFillsInReply,
  type ProspectFormFill,
} from '@/lib/salesJobs/prospectFormFill';

export type { ProspectFormFill } from '@/lib/salesJobs/prospectFormFill';
export { embedProspectFillsInReply, extractProspectFillsFromReply } from '@/lib/salesJobs/prospectFormFill';

export type PlacesProspectCriteria = {
  buyerType?: string | null;
  region?: string | null;
  notes?: string | null;
  textQuery?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters?: number | null;
  pageSize?: number | null;
  /** When true, create Prospect buyer rows. Default false: list proposals only; user saves. */
  create?: boolean | null;
  languageCode?: string | null;
};

export type PlacesProspectCandidate = {
  placeId: string;
  storeName: string;
  owner: string;
  phone: string;
  address: string;
  region: string;
  buyerType: string;
  notes: string;
  googleMapsUri: string | null;
  latitude: number | null;
  longitude: number | null;
  created: boolean;
  skippedReason?: 'duplicate_phone' | 'duplicate_store_address' | 'create_failed' | 'preview';
  prospect?: SalesProspect;
};

export type PlacesProspectingResult = {
  ok: boolean;
  query: string;
  includedType: string | null;
  error?: string;
  candidates: PlacesProspectCandidate[];
  createdCount: number;
  skippedCount: number;
  /** Best match to load into the prospect form (prefers newly created). */
  prospectFill: ProspectFormFill | null;
  /** One fill action per listed prospect (for chat buttons). */
  prospectFills: ProspectFormFill[];
};

function fillFromCandidate(row: PlacesProspectCandidate): ProspectFormFill {
  return {
    buyerId: row.prospect?.buyerId ?? null,
    customerNumber: row.prospect?.customerNumber || customerNumberForPlace(row.placeId),
    name: row.owner,
    storeName: row.storeName,
    phone: row.phone,
    address: row.address,
    region: row.region,
    buyerType: row.buyerType,
    notes: row.notes,
  };
}

const TYPE_QUERY: Record<ProspectBuyerType, string> = {
  warung: 'warung',
  kiosk: 'kiosk',
  minimarket: 'minimarket',
  restaurant: 'restoran',
  hotel: 'hotel',
  canteen: 'kantin',
  other: 'toko',
};

/** Places (New) includedType only when it maps cleanly. */
const TYPE_INCLUDED: Partial<Record<ProspectBuyerType, string>> = {
  minimarket: 'convenience_store',
  restaurant: 'restaurant',
  hotel: 'lodging',
};

function clip(value: string, max: number) {
  return value.trim().slice(0, max);
}

function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, '');
}

function normalizeStoreAddress(storeName: string, address: string) {
  return `${storeName}|${address}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

function resolveBuyerType(raw: string | null | undefined): ProspectBuyerType | '' {
  const value = clip(raw ?? '', 40).toLowerCase();
  if (isProspectBuyerType(value)) return value;
  return '';
}

export function buildPlacesTextQuery(criteria: PlacesProspectCriteria): {
  textQuery: string;
  includedType: string | null;
  buyerType: ProspectBuyerType | '';
} {
  const buyerType = resolveBuyerType(criteria.buyerType);
  const region = clip(criteria.region ?? '', 80);
  const notes = clip(criteria.notes ?? '', 200);
  const override = clip(criteria.textQuery ?? '', 300);

  if (override) {
    return {
      textQuery: override,
      includedType: buyerType ? TYPE_INCLUDED[buyerType] ?? null : null,
      buyerType,
    };
  }

  const typeLabel = buyerType ? TYPE_QUERY[buyerType] : 'toko retail';
  const parts = [typeLabel, region, notes].filter(Boolean);
  return {
    textQuery: parts.join(' ').trim() || 'toko retail Indonesia',
    includedType: buyerType ? TYPE_INCLUDED[buyerType] ?? null : null,
    buyerType,
  };
}

function customerNumberForPlace(placeId: string) {
  const hash = createHash('sha1').update(placeId).digest('hex').slice(0, 10).toUpperCase();
  return `GP-${hash}`;
}

const GOOGLE_TYPE_TO_BUYER: Partial<Record<string, ProspectBuyerType>> = {
  convenience_store: 'minimarket',
  supermarket: 'minimarket',
  grocery_store: 'minimarket',
  restaurant: 'restaurant',
  meal_takeaway: 'restaurant',
  meal_delivery: 'restaurant',
  cafe: 'restaurant',
  coffee_shop: 'restaurant',
  lodging: 'hotel',
  hotel: 'hotel',
  resort_hotel: 'hotel',
  food_court: 'canteen',
  cafeteria: 'canteen',
  market: 'warung',
  grocery_or_supermarket: 'minimarket',
};

function humanizeGoogleType(primaryType: string | null): string {
  if (!primaryType) return '';
  return primaryType.replace(/_/g, ' ').trim();
}

function buyerTypeLabel(buyerType: ProspectBuyerType | '', locale: 'en' | 'id'): string {
  const labels: Record<ProspectBuyerType, { en: string; id: string }> = {
    warung: { en: 'traditional warung / small grocery', id: 'warung tradisional / toko kelontong' },
    kiosk: { en: 'kiosk stall', id: 'kios' },
    minimarket: { en: 'minimarket / convenience store', id: 'minimarket / toko modern' },
    restaurant: { en: 'restaurant or food outlet', id: 'restoran atau outlet makanan' },
    hotel: { en: 'hotel or lodging', id: 'hotel atau penginapan' },
    canteen: { en: 'canteen', id: 'kantin' },
    other: { en: 'independent retail outlet', id: 'outlet ritel mandiri' },
  };
  if (buyerType && labels[buyerType]) return labels[buyerType][locale];
  return labels.other[locale];
}

function inferBuyerTypeFromName(name: string): ProspectBuyerType | '' {
  const lower = name.toLowerCase();
  if (/\bwarung\b|\btoko kelontong\b|\bkios kelontong\b/.test(lower)) return 'warung';
  if (/\bkiosk\b|\bkios\b/.test(lower)) return 'kiosk';
  if (/\bminimarket\b|\bindomaret\b|\balfamart\b|\balfamidi\b|\bconvenience\b/.test(lower)) {
    return 'minimarket';
  }
  if (/\bhotel\b|\bpenginapan\b|\bguest house\b|\blosmen\b/.test(lower)) return 'hotel';
  if (/\bkantin\b|\bcanteen\b|\bfood court\b/.test(lower)) return 'canteen';
  if (/\brestoran\b|\brestaurant\b|\brmh makan\b|\brumah makan\b|\bwarkop\b|\bcafe\b|\bkafe\b/.test(lower)) {
    return 'restaurant';
  }
  return '';
}

function inferBuyerTypeFromPlace(
  place: PlacesTextSearchPlace,
  hinted: ProspectBuyerType | '',
): ProspectBuyerType {
  const fromName = inferBuyerTypeFromName(place.displayName);
  if (fromName) return fromName;
  if (hinted && hinted !== 'other') return hinted;
  const typeKeys = [place.primaryType, ...place.types].filter(Boolean) as string[];
  for (const key of typeKeys) {
    const mapped = GOOGLE_TYPE_TO_BUYER[key];
    if (mapped) return mapped;
  }
  return hinted || 'other';
}

type VenueSetting =
  | 'market'
  | 'mall'
  | 'food_court'
  | 'roadside'
  | 'residential'
  | 'office'
  | 'unknown';

function detectVenueSetting(address: string, name: string): VenueSetting {
  const text = `${name} ${address}`.toLowerCase();
  if (/\bpasar\b|\bmarket\b|\bps\.\b/.test(text)) return 'market';
  if (/\bfood court\b|\bfoodcourt\b|\bpujasera\b/.test(text)) return 'food_court';
  if (/\bmall\b|\bplaza\b|\btunjungan\b|\bgwalk\b|\bgp mall\b/.test(text)) return 'mall';
  if (/\bperum\b|\bperumahan\b|\bresidential\b|\bkomplek\b/.test(text)) return 'residential';
  if (/\bkantor\b|\boffice\b|\bgedung\b/.test(text)) return 'office';
  if (/\bjl\.?\b|\bjalan\b|\broad\b/.test(text)) return 'roadside';
  return 'unknown';
}

function settingPhrase(setting: VenueSetting, locale: 'en' | 'id'): string {
  if (locale === 'id') {
    switch (setting) {
      case 'market':
        return 'berada di lingkungan pasar tradisional, dengan lalu lintas pembeli harian yang tinggi';
      case 'mall':
        return 'berada di kawasan mal atau plaza, melayani pengunjung pusat belanja';
      case 'food_court':
        return 'berada di food court atau kawasan kuliner bersama';
      case 'roadside':
        return 'berada di pinggir jalan dan mudah dijangkau pejalan atau kendaraan lewat';
      case 'residential':
        return 'berada di kawasan perumahan dan cenderung melayani warga sekitar';
      case 'office':
        return 'berada di kawasan perkantoran atau gedung';
      default:
        return 'berada di lokasi ritel yang dapat dikunjungi langsung';
    }
  }
  switch (setting) {
    case 'market':
      return 'sits in a traditional market setting with steady daily foot traffic';
    case 'mall':
      return 'is inside or beside a mall/plaza and serves shopping-center visitors';
    case 'food_court':
      return 'is in a shared food-court or culinary cluster';
    case 'roadside':
      return 'is a roadside outlet easy for walk-in and pass-by customers';
    case 'residential':
      return 'serves a residential neighborhood and nearby households';
    case 'office':
      return 'is in an office or commercial building area';
    default:
      return 'is a visit-ready retail location';
  }
}

function assortmentHint(buyerType: ProspectBuyerType, locale: 'en' | 'id'): string {
  if (locale === 'id') {
    switch (buyerType) {
      case 'warung':
        return 'Biasanya menjual kebutuhan harian, camilan kemasan, minuman, dan barang rumah tangga ukuran kecil.';
      case 'kiosk':
        return 'Cenderung fokus pada barang khusus seperti rokok, minuman, pulsa, atau camilan cepat.';
      case 'minimarket':
        return 'Menawarkan rak produk kemasan, minuman dingin, dan barang isi ulang dengan perputaran stok lebih cepat.';
      case 'restaurant':
        return 'Fokus pada makanan/minuman siap saji; peluang FMCG lebih ke bahan pendukung, minuman, atau camilan pendamping.';
      case 'hotel':
        return 'Pembelian cenderung untuk kebutuhan tamu, pantry, atau amenitas operasional.';
      case 'canteen':
        return 'Melayani pengunjung kantin dengan volume snack dan minuman yang berulang.';
      default:
        return 'Jenis dagangan perlu dicek di lapangan, tetapi lokasi cocok sebagai titik distribusi ritel.';
    }
  }
  switch (buyerType) {
    case 'warung':
      return 'Typically carries daily essentials, packaged snacks, drinks, and small household goods.';
    case 'kiosk':
      return 'Often a focused stall for cigarettes, drinks, top-ups, or quick snacks.';
    case 'minimarket':
      return 'Usually stocks packaged goods, cold drinks, and refill items with faster shelf turns.';
    case 'restaurant':
      return 'Centered on ready-to-eat food and drink; FMCG fit is strongest in drinks, ingredients, and companion snacks.';
    case 'hotel':
      return 'Buying is usually for guest service, pantry, or day-to-day operations.';
    case 'canteen':
      return 'Serves canteen traffic with repeat demand for snacks and beverages.';
    default:
      return 'Assortment should be confirmed on site, but the location fits as a retail distribution stop.';
  }
}

/** Descriptive sales note about what kind of retailer this place is. */
function describeRetailerNotes(
  place: PlacesTextSearchPlace,
  buyerType: ProspectBuyerType,
  regionHint: string,
  locale: 'en' | 'id',
): string {
  const name = clip(place.displayName, 100);
  const address = clip(place.formattedAddress, 180);
  const area = clip(regionHint, 80);
  const setting = detectVenueSetting(place.formattedAddress, place.displayName);
  const googleLabel =
    clip(place.primaryTypeDisplayName || '', 80) || humanizeGoogleType(place.primaryType);
  const kind = buyerTypeLabel(buyerType, locale);
  const editorial = clip(place.editorialSummary || '', 220);
  const ratingText =
    place.rating != null
      ? locale === 'id'
        ? ` Rating Google sekitar ${place.rating.toFixed(1)}${
            place.userRatingCount != null ? ` dari ${place.userRatingCount} ulasan` : ''
          }.`
        : ` Google rating about ${place.rating.toFixed(1)}${
            place.userRatingCount != null ? ` from ${place.userRatingCount} reviews` : ''
          }.`
      : '';
  const missingPhone =
    !place.nationalPhoneNumber
      ? locale === 'id'
        ? ' Nomor telepon belum tersedia di Google; lengkapi sebelum outreach.'
        : ' Phone is not listed on Google; update it before outreach.'
      : '';

  if (locale === 'id') {
    const where = area ? ` di ${area}` : '';
    const googleNote =
      googleLabel && googleLabel.toLowerCase() !== kind.toLowerCase()
        ? ` Google mencatat jenis tempat sebagai ${googleLabel}.`
        : '';
    const editorialNote = editorial ? ` Ringkasan Google: ${editorial}` : '';
    return clip(
      `${name} adalah ${kind}${where} dan ${settingPhrase(setting, 'id')}. Alamat: ${address}. ${assortmentHint(buyerType, 'id')}${googleNote}${editorialNote}${ratingText}${missingPhone}`,
      500,
    );
  }

  const where = area ? ` in ${area}` : '';
  const googleNote =
    googleLabel && googleLabel.toLowerCase() !== kind.toLowerCase()
      ? ` Google lists the place type as ${googleLabel}.`
      : '';
  const editorialNote = editorial ? ` Google summary: ${editorial}` : '';
  return clip(
    `${name} is a ${kind}${where} and ${settingPhrase(setting, 'en')}. Address: ${address}. ${assortmentHint(buyerType, 'en')}${googleNote}${editorialNote}${ratingText}${missingPhone}`,
    500,
  );
}

function candidateFromPlace(
  place: PlacesTextSearchPlace,
  buyerTypeHint: ProspectBuyerType | '',
  regionHint: string,
  locale: 'en' | 'id',
): Omit<PlacesProspectCandidate, 'created' | 'skippedReason' | 'prospect'> {
  const storeName = clip(place.displayName, 100);
  const owner = storeName; // Google rarely has owner; temp until rep edits
  const phone = place.nationalPhoneNumber
    ? clip(place.nationalPhoneNumber, 20)
    : '-';
  const address = clip(place.formattedAddress, 500);
  const region = regionHint || clip(place.formattedAddress.split(',').slice(-2).join(',').trim(), 80);
  const buyerType = inferBuyerTypeFromPlace(place, buyerTypeHint);

  return {
    placeId: place.id,
    storeName,
    owner,
    phone,
    address,
    region,
    buyerType,
    notes: describeRetailerNotes(place, buyerType, regionHint, locale),
    googleMapsUri: place.googleMapsUri,
    latitude: place.latitude,
    longitude: place.longitude,
  };
}

async function loadExistingKeys(distributorId: number) {
  const rows = await prisma.buyer.findMany({
    where: { userId: distributorId },
    select: { phone: true, storeName: true, address: true, customerNumber: true },
  });
  const phones = new Set<string>();
  const storeAddresses = new Set<string>();
  const customerNumbers = new Set<string>();
  for (const row of rows) {
    const phone = normalizePhone(row.phone || '');
    if (phone && phone !== '-') phones.add(phone);
    storeAddresses.add(normalizeStoreAddress(row.storeName || '', row.address || ''));
    if (row.customerNumber) customerNumbers.add(row.customerNumber);
  }
  return { phones, storeAddresses, customerNumbers };
}

/**
 * Search Google Places and optionally create Prospect buyer rows for this distributor.
 */
export async function runPlacesProspecting(
  distributorId: number,
  criteria: PlacesProspectCriteria,
): Promise<PlacesProspectingResult> {
  const { textQuery, includedType, buyerType } = buildPlacesTextQuery(criteria);
  const regionHint = clip(criteria.region ?? '', 80);
  const create = criteria.create === true;
  const locale = criteria.languageCode === 'en' ? 'en' : 'id';

  const search = await searchPlacesText({
    textQuery,
    includedType,
    latitude: criteria.latitude,
    longitude: criteria.longitude,
    radiusMeters: criteria.radiusMeters ?? 5000,
    pageSize: criteria.pageSize ?? 20,
    regionCode: 'ID',
    languageCode: locale,
  });

  if (search.error) {
    return {
      ok: false,
      query: textQuery,
      includedType,
      error: search.error,
      candidates: [],
      createdCount: 0,
      skippedCount: 0,
      prospectFill: null,
      prospectFills: [],
    };
  }

  const existing = await loadExistingKeys(distributorId);
  const candidates: PlacesProspectCandidate[] = [];
  let createdCount = 0;
  let skippedCount = 0;

  for (const place of search.places) {
    const base = candidateFromPlace(place, buyerType, regionHint, locale);
    const phoneKey = normalizePhone(base.phone);
    const storeKey = normalizeStoreAddress(base.storeName, base.address);

    if (phoneKey && phoneKey !== '-' && existing.phones.has(phoneKey)) {
      skippedCount += 1;
      candidates.push({ ...base, created: false, skippedReason: 'duplicate_phone' });
      continue;
    }
    if (storeKey && existing.storeAddresses.has(storeKey)) {
      skippedCount += 1;
      candidates.push({ ...base, created: false, skippedReason: 'duplicate_store_address' });
      continue;
    }

    if (!create) {
      candidates.push({ ...base, created: false, skippedReason: 'preview' });
      continue;
    }

    let customerNumber = customerNumberForPlace(place.id);
    if (existing.customerNumbers.has(customerNumber)) {
      customerNumber = `GP-${createHash('sha1').update(`${place.id}:${Date.now()}`).digest('hex').slice(0, 10).toUpperCase()}`;
    }

    try {
      const prospect = await createSalesProspect(distributorId, {
        customerNumber,
        name: base.owner,
        storeName: base.storeName,
        phone: base.phone,
        address: base.address,
        region: base.region,
        buyerType: base.buyerType && isProspectBuyerType(base.buyerType) ? base.buyerType : 'other',
        notes: base.notes,
      });
      existing.phones.add(phoneKey);
      existing.storeAddresses.add(storeKey);
      existing.customerNumbers.add(customerNumber);
      createdCount += 1;
      candidates.push({ ...base, created: true, prospect });
    } catch {
      skippedCount += 1;
      candidates.push({ ...base, created: false, skippedReason: 'create_failed' });
    }
  }

  // Prefer saved rows when create ran; otherwise only preview proposals (never duplicates).
  const createdRows = candidates.filter((row) => row.created && row.prospect);
  const previewRows = candidates.filter((row) => row.skippedReason === 'preview');
  const actionable = createdRows.length > 0 ? createdRows : previewRows;
  const prospectFills = actionable.slice(0, 12).map(fillFromCandidate);
  const prospectFill = prospectFills[0] ?? null;

  return {
    ok: true,
    query: textQuery,
    includedType,
    candidates,
    createdCount,
    skippedCount,
    prospectFill,
    prospectFills,
  };
}

function jsonObjectEnd(text: string, start: number): number {
  let depth = 0;
  let quote = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quote = false;
      continue;
    }
    if (char === '"') quote = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function criteriaFromPlacesSearch(value: unknown): PlacesProspectCriteria | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const s = value as Record<string, unknown>;
  const buyerType = resolveBuyerType(typeof s.buyerType === 'string' ? s.buyerType : '');
  return {
    buyerType: buyerType || undefined,
    region: typeof s.region === 'string' ? s.region : undefined,
    notes: typeof s.notes === 'string' ? s.notes : undefined,
    textQuery: typeof s.textQuery === 'string' ? s.textQuery : undefined,
    latitude: typeof s.latitude === 'number' ? s.latitude : undefined,
    longitude: typeof s.longitude === 'number' ? s.longitude : undefined,
    radiusMeters: typeof s.radiusMeters === 'number' ? s.radiusMeters : undefined,
    pageSize: typeof s.pageSize === 'number' ? s.pageSize : undefined,
    create: s.create === true,
    languageCode: typeof s.languageCode === 'string' ? s.languageCode : undefined,
  };
}

export function parsePlacesSearchFromAssistant(raw: string): PlacesProspectCriteria | null {
  const text = raw.replace(/\u2014|\u2013/g, '-');
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '{') continue;
    const end = jsonObjectEnd(text, index);
    if (end < 0) continue;
    const slice = text.slice(index, end);
    if (!/"placesSearch"/.test(slice)) continue;
    try {
      const parsed = JSON.parse(slice) as { placesSearch?: unknown };
      const criteria = criteriaFromPlacesSearch(parsed.placesSearch);
      if (criteria) return criteria;
    } catch {
      // keep scanning
    }
    index = end - 1;
  }
  return null;
}

export function stripPlacesSearchJson(reply: string) {
  let text = reply;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '{') continue;
    const end = jsonObjectEnd(text, index);
    if (end < 0) continue;
    const slice = text.slice(index, end);
    if (!/"placesSearch"/.test(slice)) continue;
    text = `${text.slice(0, index)}${text.slice(end)}`;
    index -= 1;
  }
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

export function formatPlacesProspectingReply(
  locale: 'en' | 'id',
  result: PlacesProspectingResult,
): string {
  if (!result.ok) {
    return locale === 'id'
      ? `Pencarian Google Places gagal: ${result.error || 'Kesalahan tidak diketahui'}. Pastikan Places API (New) aktif untuk kunci peta.`
      : `Google Places search failed: ${result.error || 'Unknown error'}. Confirm Places API (New) is enabled for your Maps key.`;
  }

  const created = result.candidates.filter((c) => c.created);
  const proposed = result.candidates.filter((c) => c.skippedReason === 'preview');
  const listed = (created.length ? created : proposed).slice(0, 12);
  const lines: string[] = [];

  if (locale === 'id') {
    lines.push(`Pencarian: "${result.query}"`);
    if (created.length) {
      lines.push(`Disimpan ${result.createdCount} prospek baru, dilewati ${result.skippedCount}.`);
      lines.push('Gunakan tombol di bawah untuk membuka atau mengisi formulir.');
      lines.push('Baru ditambahkan:');
    } else if (listed.length) {
      lines.push(`Ditemukan ${listed.length} outlet. Belum ada yang disimpan.`);
      lines.push('Pilih Isi kolom formulir, lalu tekan Simpan di formulir jika ingin menyimpan prospek.');
      lines.push('Usulan:');
    } else {
      lines.push('Tidak ada hasil di Google Places untuk kriteria ini. Coba ubah wilayah atau tipe pembeli.');
    }
  } else {
    lines.push(`Search: "${result.query}"`);
    if (created.length) {
      lines.push(`Saved ${result.createdCount} new prospects, skipped ${result.skippedCount}.`);
      lines.push('Use the buttons below to open or fill the form.');
      lines.push('Newly added:');
    } else if (listed.length) {
      lines.push(`Found ${listed.length} outlets. Nothing was saved.`);
      lines.push('Use Fill form fields, then Save on the form if you want to keep a prospect.');
      lines.push('Suggested:');
    } else {
      lines.push('No Google Places results for this criteria. Try a different region or buyer type.');
    }
  }

  for (const row of listed) {
    lines.push(`- ${row.storeName} · ${row.address}${row.phone !== '-' ? ` · ${row.phone}` : ''}`);
  }

  const fills =
    result.prospectFills.length > 0
      ? result.prospectFills
      : listed.map(fillFromCandidate);
  return embedProspectFillsInReply(lines.join('\n'), fills);
}

export const PLACES_BUYER_TYPES = PROSPECT_BUYER_TYPES;
