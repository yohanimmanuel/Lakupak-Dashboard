import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { getSecurityHeaders } from '@/utils/auth-security';
import { kycRegisterUploadRateLimiter } from '@/utils/rateLimiter';
import { uploadDocumentBuffer, uploadImage } from '@/lib/cloudinary';
import {
  isKycKind,
  kycExtension,
  KYC_MAX_BYTES,
  normalizeKycMime,
  sanitizeKycFilename,
  validateKycMagicBytes,
} from '@/lib/kyc/documents';

function toDataUri(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  const limited = await kycRegisterUploadRateLimiter(req);
  if (limited) return limited;

  try {
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'multipart/form-data is required' }, { status: 400, headers });
    }

    const formData = await req.formData();
    const kindRaw = formData.get('kind');
    const kind = typeof kindRaw === 'string' ? kindRaw.trim().toLowerCase() : '';
    if (!isKycKind(kind)) {
      return NextResponse.json({ error: 'Document kind must be nib or npwp' }, { status: 400, headers });
    }

    const file = formData.get('file');
    const isFileOrBlob =
      file && (file instanceof File || (typeof Blob !== 'undefined' && (file as unknown) instanceof Blob));
    if (!isFileOrBlob) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400, headers });
    }

    const fileLike = file as File | Blob;
    if (fileLike.size > KYC_MAX_BYTES) {
      return NextResponse.json({ error: 'File size exceeds maximum allowed (10MB)' }, { status: 400, headers });
    }

    const mime = normalizeKycMime(fileLike.type);
    if (!mime) {
      return NextResponse.json(
        { error: 'Unsupported file type. Upload a PDF, JPG, or PNG.' },
        { status: 400, headers },
      );
    }

    const buffer = Buffer.from(await fileLike.arrayBuffer());
    if (!validateKycMagicBytes(buffer, mime)) {
      return NextResponse.json({ error: 'File signature check failed.' }, { status: 400, headers });
    }

    const originalName =
      'name' in fileLike && typeof (fileLike as File).name === 'string'
        ? sanitizeKycFilename((fileLike as File).name)
        : sanitizeKycFilename(`${kind}.${kycExtension(mime)}`);

    const ext = kycExtension(mime);
    const fileId = crypto.randomUUID?.() ?? crypto.randomBytes(16).toString('hex');
    const publicId = `reg-${kind}-${fileId}`;

    if (process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
      if (mime === 'application/pdf') {
        const uploaded = await uploadDocumentBuffer({
          buffer,
          mimeType: mime,
          folder: 'kyc',
          publicId,
        });
        if (uploaded.success) {
          return NextResponse.json(
            {
              success: true,
              kind,
              url: uploaded.url,
              publicId: uploaded.publicId,
              name: originalName,
            },
            { status: 200, headers },
          );
        }
      } else {
        const uploaded = await uploadImage(toDataUri(buffer, mime), 'kyc');
        if (uploaded.success && uploaded.url) {
          return NextResponse.json(
            {
              success: true,
              kind,
              url: uploaded.url,
              publicId: uploaded.publicId ?? null,
              name: originalName,
            },
            { status: 200, headers },
          );
        }
      }
    }

    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Document storage is unavailable' },
        { status: 503, headers },
      );
    }

    const fileName = `${publicId}.${ext}`;
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'kyc');
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(path.join(uploadsDir, fileName), buffer);

    return NextResponse.json(
      {
        success: true,
        kind,
        url: `/uploads/kyc/${fileName}`,
        publicId: null,
        name: originalName,
      },
      { status: 200, headers },
    );
  } catch (error) {
    console.error('KYC register upload failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500, headers });
  }
}
