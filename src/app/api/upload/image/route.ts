import { NextRequest, NextResponse } from 'next/server';
import { uploadImage, deleteImage } from '@/lib/cloudinary';
import { imageUploadRateLimiter, imageDeleteRateLimiter } from '@/utils/rateLimiter';

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
      const allowedFolders = ['products', 'avatars', 'banners', 'reviews'];
      const requestedFolder = (formData.get('folder') as string) || 'products';
      const folder = allowedFolders.includes(requestedFolder) ? requestedFolder : 'products';
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

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

      const mimeType = fileLike.type || 'image/jpeg';
      if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        return NextResponse.json(
          { error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed' },
          { status: 400 }
        );
      }

      const arrayBuffer = await fileLike.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
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
    const allowedFolders = ['products', 'avatars', 'banners', 'reviews'];
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

