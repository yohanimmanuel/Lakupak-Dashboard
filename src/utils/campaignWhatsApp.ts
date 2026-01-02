import { Campaign, CampaignContentBlock } from '@/types/campaign';

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

  // Format content blocks (simplified summary for WhatsApp)
  // Note: Full campaign with images/buttons is available via the share link
  if (campaign.contentBlocks && campaign.contentBlocks.length > 0) {
    const sortedBlocks = [...campaign.contentBlocks].sort((a, b) => a.order - b.order);
    
    sortedBlocks.forEach((block) => {
      formatContentBlock(block, lines);
    });
  }

  // Add shareable link at the end
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('View full campaign:');
  const shareUrl = getCampaignShareUrl(campaign.id || campaign.campaignId);
  lines.push(shareUrl);

  return lines.join('\n').trim();
}
/**
 * Formats a content block into text lines
 */
function formatContentBlock(block: CampaignContentBlock, lines: string[]): void {
  switch (block.type) {
    case 'header':
      if (block.headerText) {
        lines.push(`*${block.headerText}*`);
        lines.push('');
      }
      break;

    case 'text':
      if (block.text) {
        let text = block.text;
        if (block.textStyle === 'bold') {
          text = `*${text}*`;
        } else if (block.textStyle === 'italic') {
          text = `_${text}_`;
        }
        lines.push(text);
        lines.push('');
      }
      break;

    case 'image':
      if (block.imageUrl) {
        lines.push(`[Image: ${block.imageAlt || 'Campaign Image'}]`);
        lines.push(block.imageUrl);
        lines.push('');
      }
      break;

    case 'product':
      if (block.productName) {
        lines.push(`*${block.productName}*`);
        if (block.productPrice !== undefined) {
          lines.push(`Price: ${formatPrice(block.productPrice)}`);
        }
        if (block.productImage) {
          lines.push(`[Product Image: ${block.productImage}]`);
        }
        if (block.productButtonLink) {
          lines.push(`Link: ${block.productButtonLink}`);
        }
        lines.push('');
      }
      break;

    case 'button':
      if (block.buttonText && block.buttonLink) {
        lines.push(`${block.buttonText}: ${block.buttonLink}`);
        lines.push('');
      } else if (block.buttonText) {
        lines.push(block.buttonText);
        lines.push('');
      }
      break;

    case 'list':
      if (block.listItems && block.listItems.length > 0) {
        block.listItems.forEach((item, index) => {
          if (item.title) {
            lines.push(`${index + 1}. *${item.title}*`);
            if (item.description) {
              lines.push(`   ${item.description}`);
            }
          }
        });
        lines.push('');
      }
      break;

    case 'divider':
      lines.push('─'.repeat(30));
      lines.push('');
      break;

    case 'spacing':
      // Add empty line for spacing
      lines.push('');
      break;

    default:
      break;
  }
}

/**
 * Formats price for display
 */
function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);
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

