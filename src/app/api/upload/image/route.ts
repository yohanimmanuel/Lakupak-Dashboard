import { NextRequest, NextResponse } from 'next/server';
import { uploadImage, deleteImage } from '@/lib/cloudinary';
import { imageUploadRateLimiter, imageDeleteRateLimiter } from '@/utils/rateLimiter';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

/**
 * Validates file content against declared MIME type using magic bytes (defense-in-depth).
 * Returns true only if the buffer signature matches the declared type.
 */
function validateMagicBytes(buffer: Buffer, declaredMimeType: string): boolean {
  if (buffer.length < 12) return false;

  switch (declaredMimeType) {
    case 'image/jpeg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/png':
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
    case 'image/gif':
      return (
        buffer[0] === 0x47 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x38 &&
        (buffer[4] === 0x37 || buffer[4] === 0x39) &&
        buffer[5] === 0x61
      );
    case 'image/webp':
      return (
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
      );
    default:
      return false;
  }
}

export async function POST(req: NextRequest) {
  // Apply rate limiting: 100 uploads per hour
  const rateLimitResponse = await imageUploadRateLimiter(req, null);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const contentType = req.headers.get('content-type') ?? '';

    // Server-only upload: client sends file as FormData; we never send api_key or cloud_name to client
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');
      const allowedFolders = ['products', 'avatars', 'banners', 'reviews', 'pod', 'returns', 'payment-proofs'];
      const requestedFolder = (formData.get('folder') as string) || 'products';
      const folder = allowedFolders.includes(requestedFolder) ? requestedFolder : 'products';
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

      const isFileOrBlob = file && (file instanceof File || (typeof Blob !== 'undefined' && (file as unknown) instanceof Blob));
      if (!isFileOrBlob) {
        return NextResponse.json(
          { error: 'No file provided' },
          { status: 400 }
        );
      }

      const fileLike = file as File | Blob;
      if (fileLike.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: 'File size exceeds maximum allowed (10MB)' },
          { status: 400 }
        );
      }

      const rawType = fileLike.type;
      if (!rawType || typeof rawType !== 'string' || rawType.trim() === '') {
        return NextResponse.json(
          {
            error: 'Validation failed: fileLike.type is missing or empty. The client must send a valid Content-Type for the file (one of: ' +
              ALLOWED_MIME_TYPES.join(', ') + ').',
          },
          { status: 400 }
        );
      }

      const mimeType = rawType.trim().toLowerCase();
      if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
        return NextResponse.json(
          {
            error:
              'Validation failed: fileLike.type "' +
              rawType +
              '" is not in ALLOWED_MIME_TYPES. Allowed values: ' +
              ALLOWED_MIME_TYPES.join(', ') +
              '.',
          },
          { status: 400 }
        );
      }

      const arrayBuffer = await fileLike.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (!validateMagicBytes(buffer, mimeType)) {
        return NextResponse.json(
          {
            error:
              'Validation failed: file content does not match declared fileLike.type "' +
              mimeType +
              '". Server-side signature check failed. Allowed types: ' +
              ALLOWED_MIME_TYPES.join(', ') +
              '.',
          },
          { status: 400 }
        );
      }

      const base64 = buffer.toString('base64');
      const dataUri = `data:${mimeType};base64,${base64}`;
      const result = await uploadImage(dataUri, folder);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Upload failed' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        url: result.url,
        publicId: result.publicId,
        width: result.width,
        height: result.height,
        format: result.format,
      });
    }

    // Legacy JSON body: base64 image (no client credentials exposed)
    const body = await req.json();
    const { image, folder: requestedFolder = 'products' } = body;
    const allowedFolders = ['products', 'avatars', 'banners', 'reviews', 'pod'];
    const folder = allowedFolders.includes(requestedFolder) ? requestedFolder : 'products';
    if (!image) {
      return NextResponse.json(
        { error: 'No image provided' },
        { status: 400 }
      );
    }

    const result = await uploadImage(image, folder);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Upload failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url: result.url,
      publicId: result.publicId,
      width: result.width,
      height: result.height,
      format: result.format,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  // Apply rate limiting: 100 deletions per hour
  const rateLimitResponse = await imageDeleteRateLimiter(req, null);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  
  try {
    const { searchParams } = new URL(req.url);
    const publicId = searchParams.get('publicId');

    if (!publicId) {
      return NextResponse.json(
        { error: 'No publicId provided' },
        { status: 400 }
      );
    }

    const result = await deleteImage(publicId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Delete failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      result: result.result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    );
  }
}

