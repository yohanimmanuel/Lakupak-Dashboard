import { NextRequest, NextResponse } from 'next/server';
import { getSecurityHeaders } from '@/utils/auth-security';
import { buildRawAttachmentUrl, sanitizeAttachmentFilenameBase, uploadDocumentBuffer } from '@/lib/cloudinary';
import { imageUploadRateLimiter } from '@/utils/rateLimiter';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const PDF_MIME = 'application/pdf';

function validatePdfMagicBytes(buffer: Buffer): boolean {
  return (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  );
}

/**
 * POST /api/mobile/upload/payment-receipt
 * Marketplace buyer uploads a PDF transfer receipt (multipart).
 */
export async function POST(request: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    const { getAuthenticatedMarketplaceUserId } = await import('@/utils/auth-helpers');
    const auth = await getAuthenticatedMarketplaceUserId(request);
    if (!auth.ok) {
      if (auth.reason === 'suspended') {
        return NextResponse.json({ error: 'Account suspended' }, { status: 403, headers });
      }
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers });
    }

    const rateLimitResponse = await imageUploadRateLimiter(request, auth.userId);
    if (rateLimitResponse) return rateLimitResponse;

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'multipart/form-data is required' }, { status: 400, headers });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const isFileOrBlob =
      file && (file instanceof File || (typeof Blob !== 'undefined' && (file as unknown) instanceof Blob));
    if (!isFileOrBlob) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400, headers });
    }

    const fileLike = file as File | Blob;
    if (fileLike.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds maximum allowed (10MB)' }, { status: 400, headers });
    }

    const rawType = fileLike.type?.trim().toLowerCase() ?? '';
    if (rawType !== PDF_MIME) {
      return NextResponse.json({ error: 'Only PDF receipts are allowed' }, { status: 400, headers });
    }

    const buffer = Buffer.from(await fileLike.arrayBuffer());
    if (!validatePdfMagicBytes(buffer)) {
      return NextResponse.json({ error: 'Invalid PDF file' }, { status: 400, headers });
    }

    const rawName =
      file instanceof File && file.name?.trim()
        ? file.name.trim()
        : 'receipt.pdf';
    const filenameBase = sanitizeAttachmentFilenameBase(
      rawName.replace(/\.pdf$/i, '') || 'receipt',
    );

    const result = await uploadDocumentBuffer({
      buffer,
      mimeType: PDF_MIME,
      folder: 'payment-proofs',
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Upload failed' }, { status: 500, headers });
    }

    const downloadUrl = buildRawAttachmentUrl({
      publicId: result.publicId,
      filenameBase,
      format: 'pdf',
    });

    return NextResponse.json(
      {
        success: true,
        url: result.url,
        downloadUrl,
        publicId: result.publicId,
        fileName: rawName.endsWith('.pdf') ? rawName : `${rawName}.pdf`,
        format: result.format,
      },
      { headers },
    );
  } catch (error) {
    console.error('[mobile/upload/payment-receipt] POST error', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500, headers });
  }
}
