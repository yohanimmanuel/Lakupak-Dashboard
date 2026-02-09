/**
 * Server-only Cloudinary upload: client sends file to our API; API key and cloud name
 * never leave the server. No credentials are sent to the client.
 */

export interface CloudinaryUploadResult {
  success: boolean;
  url?: string;
  publicId?: string;
  width?: number;
  height?: number;
  error?: string;
}

/**
 * Upload file via our API. The server uploads to Cloudinary; api_key and cloud_name
 * are never sent to the client.
 */
export async function uploadToCloudinaryDirect(
  file: File,
  folder: string
): Promise<CloudinaryUploadResult> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);

    const res = await fetch('/api/upload/image', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Upload failed: ${res.status}`);
    }

    const data = await res.json();
    return {
      success: true,
      url: data.url,
      publicId: data.publicId,
      width: data.width,
      height: data.height,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

