/** Missed-tick window only. A 24h catch-up sent as soon as you opened an overdue workflow. */
export const SCHEDULE_GRACE_MS = 10 * 60 * 1000;

/** Allow Activate a few seconds after the minute; do not catch-up a time already in the past. */
export const SCHEDULE_SAVE_SKEW_MS = 60 * 1000;

export const SCHEDULE_CLAIM_KEY = 'scheduleClaimKey';

export function scheduledSendAtIdentity(
  config: Record<string, unknown> | null | undefined,
): string {
  if (!config) return '';
  return String(config.sendAtUtc ?? config.sendAt ?? '').trim();
}

export function scheduleClaimMatches(
  config: Record<string, unknown> | null | undefined,
  runKey: string,
): boolean {
  return String(config?.[SCHEDULE_CLAIM_KEY] ?? '').trim() === runKey;
}

export function withScheduleClaim(
  config: Record<string, unknown> | null | undefined,
  runKey: string,
): Record<string, unknown> {
  return { ...(config ?? {}), [SCHEDULE_CLAIM_KEY]: runKey };
}

/** Keep the claim when the user saves without changing Send-at. */
export function preserveScheduleClaim(
  existing: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const prevKey = String(existing?.[SCHEDULE_CLAIM_KEY] ?? '').trim();
  if (!prevKey) return next;
  if (scheduledSendAtIdentity(existing) !== scheduledSendAtIdentity(next)) return next;
  return { ...next, [SCHEDULE_CLAIM_KEY]: prevKey };
}

export function parseScheduledSendAtMs(
  config: Record<string, unknown> | null | undefined,
): number | null {
  if (!config) return null;
  const utc = String(config.sendAtUtc ?? '').trim();
  if (utc) {
    const t = Date.parse(utc);
    if (Number.isFinite(t)) return t;
  }
  const raw = String(config.sendAt ?? '').trim();
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

export function isScheduledSendAtInFuture(
  config: Record<string, unknown> | null | undefined,
  nowMs = Date.now(),
): boolean {
  const sendAtMs = parseScheduledSendAtMs(config);
  return sendAtMs != null && sendAtMs > nowMs;
}

/** True only when Send-at has arrived, was not already past at last save, and is within the grace window. */
export function isCampaignScheduleDue(opts: {
  sendAtMs: number;
  nowMs: number;
  lastSavedAtMs: number;
}): boolean {
  const { sendAtMs, nowMs, lastSavedAtMs } = opts;
  if (sendAtMs > nowMs) return false;
  if (nowMs - sendAtMs > SCHEDULE_GRACE_MS) return false;
  if (lastSavedAtMs >= sendAtMs + SCHEDULE_SAVE_SKEW_MS) return false;
  return true;
}

/** `datetime-local` value → UTC ISO using the browser/OS local timezone. */
export function dateTimeLocalToUtcIso(local: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(
    local.trim(),
  );
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] != null ? Number(match[6]) : 0;
  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  if (Number.isNaN(date.getTime())) return '';
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return '';
  }
  return date.toISOString();
}

export function utcIsoToDateTimeLocal(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
