export type TourProgressStatus = 'none' | 'completed' | 'dismissed';

export interface TourProgressEntry {
  v: number;
  status: Exclude<TourProgressStatus, 'none'>;
}

export type TourProgressBlob = Record<string, TourProgressEntry>;

function isEntry(x: unknown): x is TourProgressEntry {
  if (!x || typeof x !== 'object') return false;
  const o = x as { v?: unknown; status?: unknown };
  return Number.isFinite(o.v) && (o.status === 'completed' || o.status === 'dismissed');
}

/** Prefer newer version; if same version, prefer completed over dismissed. */
export function mergeTourBlobs(local: TourProgressBlob, remote: unknown): TourProgressBlob {
  if (!remote || typeof remote !== 'object') return { ...local };
  const out: TourProgressBlob = { ...local };
  for (const [key, val] of Object.entries(remote as Record<string, unknown>)) {
    if (!isEntry(val)) continue;
    const cur = out[key];
    if (!cur) {
      out[key] = val;
      continue;
    }
    if (val.v > cur.v) {
      out[key] = val;
      continue;
    }
    if (val.v === cur.v) {
      if (val.status === 'completed' && cur.status === 'dismissed') {
        out[key] = val;
      }
    }
  }
  return out;
}
