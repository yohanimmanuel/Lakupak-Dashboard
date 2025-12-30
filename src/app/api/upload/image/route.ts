import { NextRequest, NextResponse } from 'next/server';
import { uploadImage, deleteImage } from '@/lib/cloudinary';
import cloudinary from '@/lib/cloudinary';
import { imageUploadRateLimiter, imageDeleteRateLimiter } from '@/utils/rateLimiter';

export async function POST(req: NextRequest) {
  // Apply rate limiting: 50 uploads per hour
  const rateLimitResponse = await imageUploadRateLimiter(req);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  
  try {
    const body = await req.json();
    
    // Check if this is a signature request (for direct upload)
    if (body.getSignature) {
      const { folder = 'products' } = body;

      const timestamp = Math.round(new Date().getTime() / 1000);
      
      // Generate upload parameters
      const uploadParams = {
        timestamp: timestamp,
        folder: `laku/${folder}`,
      };

      // Generate signature
      const signature = cloudinary.utils.api_sign_request(
        uploadParams,
        process.env.CLOUDINARY_API_SECRET!
      );

      return NextResponse.json({
        success: true,
        signature,
        timestamp,
        cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        folder: uploadParams.folder,
      });
    }

    // Legacy base64 upload method
    const { image, folder = 'products' } = body;

    if (!image) {
      return NextResponse.json(
        { error: 'No image provided' },
        { status: 400 }
      );
    }

    // Upload to Cloudinary
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
  const rateLimitResponse = await imageDeleteRateLimiter(req);
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

