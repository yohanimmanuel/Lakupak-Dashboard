import { NextRequest, NextResponse } from 'next/server';
import { imageUploadRateLimiter } from '@/utils/rateLimiter';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import JSZip from 'jszip';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

function validateMagicBytes(buffer: Buffer, declaredMimeType: string): boolean {
  if (buffer.length < 8) return false;
  if (declaredMimeType === 'application/pdf') {
    // "%PDF-"
    return (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d
    );
  }
  // DOCX is a ZIP container: "PK\x03\x04"
  if (declaredMimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  }
  return false;
}

async function validateDocxZip(buffer: Buffer): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });

    // Primary DOCX entry
    if (zip.file('word/document.xml')) return true;

    // Fallback: check Content Types for WordprocessingML main document type
    const contentTypes = zip.file('[Content_Types].xml');
    if (!contentTypes) return false;
    const xml = await contentTypes.async('text');
    return xml.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml');
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
  }

  const rateLimitResponse = await imageUploadRateLimiter(req, userId);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'multipart/form-data is required' }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const requestedFolder = (formData.get('folder') as string) || 'commission-invoices';
    const folder = String(requestedFolder || 'commission-invoices').trim() || 'commission-invoices';

    const isFileOrBlob =
      file && (file instanceof File || (typeof Blob !== 'undefined' && (file as unknown) instanceof Blob));
    if (!isFileOrBlob) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileLike = file as File | Blob;
    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
    if (fileLike.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds maximum allowed (20MB)' }, { status: 400 });
    }

    const rawType = fileLike.type;
    if (!rawType || typeof rawType !== 'string' || rawType.trim() === '') {
      return NextResponse.json(
        {
          error:
            'Validation failed: file.type is missing. Allowed types: ' + ALLOWED_MIME_TYPES.join(', ') + '.',
        },
        { status: 400 }
      );
    }

    const mimeType = rawType.trim().toLowerCase();
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
      return NextResponse.json(
        {
          error: 'Validation failed: unsupported file.type "' + rawType + '". Allowed: ' + ALLOWED_MIME_TYPES.join(', '),
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await fileLike.arrayBuffer());
    if (!validateMagicBytes(buffer, mimeType)) {
      return NextResponse.json({ error: 'Validation failed: file signature check failed.' }, { status: 400 });
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const ok = await validateDocxZip(buffer);
      if (!ok) {
        return NextResponse.json({ error: 'Validation failed: not a valid DOCX document.' }, { status: 400 });
      }
    }

    const safeFolder = folder.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 64) || 'commission-invoices';
    const ext = mimeType === 'application/pdf' ? 'pdf' : 'docx';
    const fileName = `${crypto.randomUUID?.() ?? crypto.randomBytes(16).toString('hex')}.${ext}`;

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', safeFolder);
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(path.join(uploadsDir, fileName), buffer);

    return NextResponse.json({
      success: true,
      url: `/uploads/${safeFolder}/${fileName}`,
      publicId: null,
      format: ext,
      bytes: buffer.length,
    });
  } catch (error) {
    console.error('Document upload failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

