import type { DescribedProspectInput } from '@/lib/salesJobs/prospects';
import {
  embedProspectFillsInReply,
  type ProspectFormFill,
} from '@/lib/salesJobs/prospectFormFill';

function jsonObjectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function clip(value: unknown, max: number): string {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

function fromJson(value: unknown): DescribedProspectInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const name = clip(row.name ?? row.owner, 100);
  const phone = clip(row.phone, 20);
  const address = clip(row.address, 500);
  if (!name || !phone || !address) return null;
  return {
    name,
    storeName: clip(row.storeName, 100) || name,
    phone,
    address,
    businessType: clip(row.businessType ?? row.buyerType, 100) || 'Retailer',
    email: clip(row.email, 254) || null,
    region: clip(row.region, 80) || null,
    notes: clip(row.notes, 500) || null,
    customerNumber: clip(row.customerNumber, 50) || null,
  };
}

/** Read createProspect from the model JSON blob (same pattern as placesSearch). */
export function parseCreateProspectFromAssistant(raw: string): DescribedProspectInput | null {
  const text = raw.replace(/\u2014|\u2013/g, '-');
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '{') continue;
    const end = jsonObjectEnd(text, index);
    if (end < 0) continue;
    const slice = text.slice(index, end);
    if (!/"createProspect"/.test(slice)) continue;
    try {
      const parsed = JSON.parse(slice) as { createProspect?: unknown };
      const input = fromJson(parsed.createProspect);
      if (input) return input;
    } catch {
      // keep scanning
    }
    index = end - 1;
  }
  return null;
}

export function stripCreateProspectJson(reply: string) {
  let text = reply;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '{') continue;
    const end = jsonObjectEnd(text, index);
    if (end < 0) continue;
    const slice = text.slice(index, end);
    if (!/"createProspect"/.test(slice)) continue;
    text = `${text.slice(0, index)}${text.slice(end)}`;
    index -= 1;
  }
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/** Same Fill-form payload as Places preview — never assigns a buyerId until the user saves. */
function fillFromInput(input: DescribedProspectInput): ProspectFormFill {
  return {
    buyerId: null,
    customerNumber: input.customerNumber || '',
    name: input.name,
    storeName: input.storeName || input.name,
    phone: input.phone,
    address: input.address,
    region: input.region || '',
    buyerType: input.businessType || '',
    notes: input.notes || '',
  };
}

/**
 * Propose a prospect for the Clients → Buyers form.
 * Does not write to the database; the user must Fill form fields then Save.
 */
export async function runCreateProspectFromAssistant(
  _distributorId: number,
  locale: 'en' | 'id',
  input: DescribedProspectInput,
): Promise<{ reply: string; prospectFill: ProspectFormFill; prospectFills: ProspectFormFill[] }> {
  const fill = fillFromInput(input);
  const lines =
    locale === 'id'
      ? [
          'Belum ada yang disimpan.',
          `Nama: ${fill.name}`,
          `Toko: ${fill.storeName}`,
          `Telepon: ${fill.phone}`,
          `Alamat: ${fill.address}`,
          `Tipe bisnis: ${fill.buyerType || '—'}`,
          `Status: Prospect`,
          'Pilih Isi kolom formulir, lalu Simpan di Klien → Pembeli jika ingin menyimpan.',
        ]
      : [
          'Nothing was saved yet.',
          `Name: ${fill.name}`,
          `Store: ${fill.storeName}`,
          `Phone: ${fill.phone}`,
          `Address: ${fill.address}`,
          `Business type: ${fill.buyerType || '—'}`,
          `Status: Prospect`,
          'Use Fill form fields, then Save in Clients → Buyers (status Prospect) if you want to keep them.',
        ];
  return {
    reply: embedProspectFillsInReply(lines.join('\n'), [fill]),
    prospectFill: fill,
    prospectFills: [fill],
  };
}
