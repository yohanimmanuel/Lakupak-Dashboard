const COUNTRY_DIAL_CODES: Record<string, string> = {
  ID: '62',
  SG: '65',
  MY: '60',
  PH: '63',
  TH: '66',
  VN: '84',
  US: '1',
};

export function normalizeMarketplacePhone(
  rawPhone: string,
  options?: { countryCode?: string | null; countryDialCode?: string | null },
): string | null {
  const trimmed = rawPhone.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('+')) {
    const normalized = `+${trimmed.slice(1).replace(/\D/g, '')}`;
    return normalized.length > 1 ? normalized : null;
  }

  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (!digits) return null;

  const dialFromField = options?.countryDialCode?.replace(/\D/g, '');
  const dialFromCountry = options?.countryCode
    ? COUNTRY_DIAL_CODES[options.countryCode.toUpperCase()]
    : undefined;
  const dial = dialFromField || dialFromCountry;

  if (dial) {
    return `+${dial}${digits}`;
  }

  return `+${digits}`;
}
