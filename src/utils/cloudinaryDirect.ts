/**
 * Direct upload to Cloudinary (faster, no base64 conversion)
 * This bypasses the server and uploads directly to Cloudinary
 * 
 * Performance improvements:
 * - No base64 encoding (33% smaller payload)
 * - Direct client-to-Cloudinary upload (single network hop)
 * - Uses native browser FormData (more efficient)
 */

export interface UploadSignature {
  signature: string;
  timestamp: number;
  cloudName: string;
  apiKey: string;
  folder: string;
}

export interface CloudinaryUploadResult {
  success: boolean;
  url?: string;
  publicId?: string;
  width?: number;
  height?: number;
  error?: string;
}

/**
 * Upload file directly to Cloudinary using signed upload
 * @param file - The file to upload
 * @param folder - The folder path on Cloudinary (e.g., 'products', 'users/avatars')
 * @returns Promise with upload result
 */
export async function uploadToCloudinaryDirect(
  file: File,
  folder: string
): Promise<CloudinaryUploadResult> {
  try {
    // Step 1: Get upload signature from our API
    const signatureResponse = await fetch('/api/upload/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        getSignature: true,
        folder,
      }),
    });

    if (!signatureResponse.ok) {
      throw new Error('Failed to get upload signature');
    }

    const signatureData: UploadSignature = await signatureResponse.json();

    // Step 2: Upload directly to Cloudinary
    const formData = new FormData();
    formData.append('file', file);
    formData.append('signature', signatureData.signature);
    formData.append('timestamp', signatureData.timestamp.toString());
    formData.append('api_key', signatureData.apiKey);
    formData.append('folder', signatureData.folder);

    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json();
      throw new Error(errorData.error?.message || 'Upload to Cloudinary failed');
    }

    const result = await uploadResponse.json();

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

