type LogisticsFields = {
  preferredDays: string;
  lastShipment: string;
  lastVisit: string;
  shipmentSuccess: string;
};

const EMPTY_LOGISTICS: LogisticsFields = {
  preferredDays: '',
  lastShipment: '',
  lastVisit: '',
  shipmentSuccess: '',
};

function logisticsText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Date portion only, so export cells stay a date and do not carry order text. */
export function logisticsDateOnly(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const iso = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dayFirst = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (dayFirst) {
    return `${dayFirst[3]}-${dayFirst[2].padStart(2, '0')}-${dayFirst[1].padStart(2, '0')}`;
  }
  return trimmed;
}

export function readBuyerLogistics(logistics?: string | null): LogisticsFields {
  if (!logistics) return EMPTY_LOGISTICS;
  try {
    const parsed = JSON.parse(logistics) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY_LOGISTICS;
    return {
      preferredDays: logisticsText(parsed.preferredDays),
      lastShipment: logisticsDateOnly(logisticsText(parsed.lastShipment)),
      lastVisit: logisticsDateOnly(logisticsText(parsed.lastVisit)),
      shipmentSuccess: logisticsText(parsed.shipmentSuccess),
    };
  } catch {
    return EMPTY_LOGISTICS;
  }
}

/** Read lastVisit from buyer logistics JSON; empty when missing, malformed, or non-string. */
export function logisticsLastVisit(buyer: { logistics?: string | null }): string {
  return readBuyerLogistics(buyer.logistics).lastVisit;
}
