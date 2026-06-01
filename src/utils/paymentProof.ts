const MAX_PROOF_URLS = 1;
const MAX_URL_LENGTH = 2048;
const MAX_FILE_NAME_LENGTH = 200;

function isProbablyHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeEncodedFileName(name: string): string {
  let s = String(name ?? '').trim();
  if (!s) return s;
  if (/%[0-9A-Fa-f]{2}/.test(s)) {
    try {
      s = decodeURIComponent(s);
    } catch {
      // keep original
    }
  }
  return s.replace(/%20/gi, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeProofFileName(name: string): string {
  const t = normalizeEncodedFileName(name)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.slice(0, MAX_FILE_NAME_LENGTH);
}

/** Sanitize buyer-submitted payment proof URLs (images or PDF receipts). */
export function sanitizePaymentProofUrls(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((u) => typeof u === 'string')
    .map((u) => u.trim())
    .filter((u) => u.length > 0 && u.length <= MAX_URL_LENGTH && isProbablyHttpUrl(u))
    .slice(0, MAX_PROOF_URLS);
}

/** Sanitize original file names (parallel to proof URLs). */
export function sanitizePaymentProofFileNames(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((n) => typeof n === 'string')
    .map((n) => sanitizeProofFileName(n))
    .filter((n) => n.length > 0)
    .slice(0, MAX_PROOF_URLS);
}

export function isPaymentProofPdfUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('.pdf') || lower.includes('/raw/upload/');
}

/** Best-effort file name from a proof URL path segment. */
export function pdfDisplayNameFromUrl(url: string): string | null {
  try {
    const segment = new URL(url).pathname.split('/').filter(Boolean).pop();
    if (!segment) return null;
    const normalized = normalizeEncodedFileName(segment);
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
}

/** Human-readable label for UI (prefers stored buyer file name). */
export function paymentProofDisplayName(
  url: string,
  storedFileName?: string | null,
  orderId?: string,
): string {
  const stored = storedFileName?.trim();
  if (stored) return normalizeEncodedFileName(stored);
  const fromUrl = pdfDisplayNameFromUrl(url);
  if (fromUrl && /\.(pdf|jpe?g|png|gif|webp)$/i.test(fromUrl)) return fromUrl;
  if (orderId) {
    const ext = isPaymentProofPdfUrl(url) ? 'pdf' : 'jpg';
    return `payment-proof-${orderId}.${ext}`;
  }
  return isPaymentProofPdfUrl(url) ? 'receipt.pdf' : 'payment-proof.jpg';
}

/** Filename for Content-Disposition on proxied download. */
export function paymentProofDownloadFilename(opts: {
  orderId: string;
  url: string;
  storedFileName?: string | null;
}): string {
  const storedRaw = opts.storedFileName?.trim();
  if (storedRaw) {
    const stored = normalizeEncodedFileName(storedRaw);
    if (isPaymentProofPdfUrl(opts.url) && !stored.toLowerCase().endsWith('.pdf')) {
      return `${stored}.pdf`;
    }
    if (!isPaymentProofPdfUrl(opts.url) && !/\.(jpe?g|png|gif|webp)$/i.test(stored)) {
      return `${stored}.jpg`;
    }
    return stored;
  }
  const fromUrl = pdfDisplayNameFromUrl(opts.url);
  if (fromUrl && /\.(pdf|jpe?g|png|gif|webp)$/i.test(fromUrl)) return fromUrl;
  const ext = isPaymentProofPdfUrl(opts.url) ? 'pdf' : 'jpg';
  return `payment-proof-${opts.orderId}.${ext}`;
}

export function paymentProofDownloadHref(orderId: string, index: number): string {
  return `/api/orders/payment-proof/download?orderId=${encodeURIComponent(orderId)}&index=${index}`;
}

export function assertCloudinaryProofUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (u.hostname !== 'res.cloudinary.com') return false;
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
    if (cloudName && !u.pathname.startsWith(`/${cloudName}/`)) return false;
    return true;
  } catch {
    return false;
  }
}

export function contentDispositionAttachment(filename: string): string {
  const safe = filename.replace(/"/g, "'");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

export function contentTypeForProofUrl(url: string): string {
  if (isPaymentProofPdfUrl(url)) return 'application/pdf';
  const lower = url.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.gif')) return 'image/gif';
  return 'image/jpeg';
}
