import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export default cloudinary;

function toBase64DataUri(buffer: Buffer, mimeType: string): string {
  const b64 = buffer.toString('base64');
  return `data:${mimeType};base64,${b64}`;
}

export const uploadImage = async (file: string, folder: string = 'products') => {
  try {
    const result = await cloudinary.uploader.upload(file, {
      folder: `laku/${folder}`,
      resource_type: 'auto',
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' }, // Max dimensions
        { quality: 'auto:good' }, // Auto quality optimization
        { fetch_format: 'auto' }, // Auto format (WebP when supported)
      ],
    });

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
};

export const uploadDocument = async (file: string, folder: string = 'documents') => {
  try {
    const result = await cloudinary.uploader.upload(file, {
      folder: `laku/${folder}`,
      resource_type: 'raw',
    });

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
};

export async function uploadDocumentBuffer(params: {
  buffer: Buffer;
  mimeType: string;
  folder?: string;
  publicId?: string;
}): Promise<
  | { success: true; url: string; publicId: string; format?: string; bytes?: number }
  | { success: false; error: string }
> {
  try {
    const file = toBase64DataUri(params.buffer, params.mimeType);
    const result = await cloudinary.uploader.upload(file, {
      folder: `laku/${params.folder ?? 'documents'}`,
      resource_type: 'raw',
      public_id: params.publicId,
    });
    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

export const deleteImage = async (publicId: string) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return {
      success: result.result === 'ok',
      result: result.result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed',
    };
  }
};

export const deleteDocument = async (publicId: string) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    return {
      success: result.result === 'ok',
      result: result.result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed',
    };
  }
};

export function sanitizeAttachmentFilenameBase(name: string): string {
  // Cloudinary allowed: A-Z a-z 0-9 _ - ! space (and . only via special escaping)
  const t = String(name ?? '').trim();
  const cleaned = t.replace(/[^A-Za-z0-9_\-! ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 120) || 'download';
}

export function buildRawAttachmentUrl(params: { publicId: string; filenameBase: string; format: 'pdf' | 'docx' }): string {
  const filenameBase = sanitizeAttachmentFilenameBase(params.filenameBase);
  // fl_attachment:<filename> forces browser download with the provided base name.
  return cloudinary.url(params.publicId, {
    secure: true,
    resource_type: 'raw',
    flags: `attachment:${filenameBase}`,
    format: params.format,
  });
}

export const getOptimizedImageUrl = (url: string, options?: {
  width?: number;
  height?: number;
  quality?: string;
  format?: string;
}) => {
  if (!url || !url.includes('cloudinary.com')) {
    return url; // Return original URL if not a Cloudinary URL
  }

  const { width, height, quality = 'auto:good', format = 'auto' } = options || {};
  
  // Extract the upload part and add transformations
  const uploadIndex = url.indexOf('/upload/');
  if (uploadIndex === -1) return url;

  const transformations = [];
  if (width || height) {
    const dims = [
      width && `w_${width}`,
      height && `h_${height}`,
      'c_limit' // Don't upscale
    ].filter(Boolean).join(',');
    transformations.push(dims);
  }
  transformations.push(`q_${quality}`);
  transformations.push(`f_${format}`);

  const before = url.substring(0, uploadIndex + 8);
  const after = url.substring(uploadIndex + 8);
  
  return `${before}${transformations.join('/')}/${after}`;
};

