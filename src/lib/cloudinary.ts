import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export default cloudinary;

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

