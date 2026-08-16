import { Campaign } from '@/types/campaign';

/**
 * Gets the base URL for the application
 */
function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

/**
 * Gets the shareable URL for a campaign
 */
export function getCampaignShareUrl(campaignId: string): string {
  const baseUrl = getBaseUrl();
  return `${baseUrl}/campaigns/share/${campaignId}`;
}

/**
 * Formats a campaign into a WhatsApp-friendly text message with shareable link
 * Only includes campaign title, description, and link to view full campaign
 */
export function formatCampaignForWhatsApp(campaign: Campaign): string {
  const lines: string[] = [];

  // Add campaign name as header
  if (campaign.name) {
    lines.push(`*${campaign.name}*`);
    lines.push('');
  }

  // Add description if available
  if (campaign.description) {
    lines.push(campaign.description);
    lines.push('');
  }

  // Add shareable link
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('View full campaign:');
  const shareUrl = getCampaignShareUrl(campaign.id || campaign.campaignId);
  lines.push(shareUrl);

  return lines.join('\n').trim();
}

/** One WhatsApp message for one or more campaigns. Browsers only allow one share window per click. */
export function formatCampaignsForWhatsApp(campaigns: Campaign[]): string {
  return campaigns
    .map((campaign) => formatCampaignForWhatsApp(campaign))
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Normalizes phone number for WhatsApp (removes spaces, dashes, etc.)
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // Returns normalized phone number
  // Note: Country code should be included in the input if required
  return cleaned;
}
/**
 * Creates a WhatsApp share URL
 * @param message - The message text to share
 * @param phoneNumber - Optional phone number (with country code, e.g., +1234567890)
 * @returns WhatsApp URL string
 */
export function createWhatsAppShareUrl(message: string, phoneNumber?: string): string {
  const encodedMessage = encodeURIComponent(message);
  
  if (phoneNumber) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    // Remove + from phone number for URL
    const phoneWithoutPlus = normalizedPhone.replace(/^\+/, '');
    return `https://api.whatsapp.com/send?phone=${phoneWithoutPlus}&text=${encodedMessage}`;
  } else {
    // Generic share - opens contact picker
    return `https://wa.me/?text=${encodedMessage}`;
  }
}

/**
 * Opens WhatsApp share URL in a new window/tab
 */
export function shareToWhatsApp(message: string, phoneNumber?: string): void {
  const url = createWhatsAppShareUrl(message, phoneNumber);
  window.open(url, '_blank', 'noopener,noreferrer');
}

