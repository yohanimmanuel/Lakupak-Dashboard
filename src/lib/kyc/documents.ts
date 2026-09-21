const CLOUDINARY_HOSTS = new Set(['res.cloudinary.com', 'cloudinary.com']);

export const KYC_MAX_BYTES = 10 * 1024 * 1024;

export const KYC_ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
] as const;

export type KycKind = 'nib' | 'npwp';

export function isKycKind(value: unknown): value is KycKind {
  return value === 'nib' || value === 'npwp';
}

export function normalizeKycMime(raw: string | null | undefined): string | null {
  const mime = (raw ?? '').trim().toLowerCase();
  if (!mime) return null;
  if ((KYC_ALLOWED_MIME as readonly string[]).includes(mime)) {
    return mime === 'image/jpg' || mime === 'image/pjpeg' ? 'image/jpeg' : mime;
  }
  return null;
}

export function kycExtension(mime: string): 'pdf' | 'jpg' | 'png' {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  return 'jpg';
}

export function validateKycMagicBytes(buffer: Buffer, mime: string): boolean {
  if (buffer.length < 8) return false;
  if (mime === 'application/pdf') {
    return (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d
    );
  }
  if (mime === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mime === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  return false;
}

export function sanitizeKycFilename(name: string | null | undefined): string {
  const raw = (name ?? '').trim().replace(/[/\\]/g, '');
  const cleaned = raw.replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 120);
  return cleaned || 'document';
}

export function isAllowedKycStoredUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const t = url.trim();
  if (!t || t.length > 2000) return false;
  if (t.startsWith('/uploads/kyc/')) {
    return !t.includes('..') && /^\/uploads\/kyc\/[A-Za-z0-9._\-]+$/.test(t);
  }
  try {
    const parsed = new URL(t);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'res.cloudinary.com' || host.endsWith('.cloudinary.com')) return true;
    return CLOUDINARY_HOSTS.has(host);
  } catch {
    return false;
  }
}
