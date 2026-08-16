import type { CampaignContentBlock } from '@/types/campaign';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function imgTag(src: string, alt: string): string {
  const url = src.trim();
  if (!isHttpUrl(url)) return '';
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:8px;" />`;
}

function linkify(escaped: string): string {
  return escaped.replace(
    /(https?:\/\/(?:[^\s<&]|&amp;amp;|&amp;)+)/g,
    (url) => {
      const core = url.replace(/[.,)]+$/, '');
      if (!core) return url;
      const trailing = url.slice(core.length);
      return `<a href="${core}" style="color:#0a61d7;word-break:break-all;">${core}</a>${trailing}`;
    },
  );
}

function paragraphHtml(text: string): string {
  const body = linkify(escapeHtml(text).replace(/\n/g, '<br/>'));
  return `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111111;">${body}</p>`;
}

function parseBlocks(raw: unknown): CampaignContentBlock[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { blocks?: unknown }).blocks)
      ? ((raw as { blocks: unknown[] }).blocks)
      : [];
  return list
    .map((item) => (item && typeof item === 'object' ? (item as CampaignContentBlock) : null))
    .filter((block): block is CampaignContentBlock => Boolean(block?.type))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function renderBlock(block: CampaignContentBlock): string {
  switch (block.type) {
    case 'header': {
      const image = block.headerImage ? imgTag(block.headerImage, block.headerText || 'Campaign') : '';
      const title = block.headerText
        ? `<h2 style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.3;color:#111111;">${escapeHtml(block.headerText)}</h2>`
        : '';
      return `${image}${title}`;
    }
    case 'image':
      return block.imageUrl ? imgTag(block.imageUrl, block.imageAlt || 'Campaign image') : '';
    case 'text':
      return block.text ? paragraphHtml(block.text) : '';
    case 'product': {
      const image = block.productImage
        ? imgTag(block.productImage, block.productName || 'Product')
        : '';
      const name = block.productName
        ? `<p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#111111;">${escapeHtml(block.productName)}</p>`
        : '';
      const price =
        typeof block.productPrice === 'number'
          ? `<p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#333333;">${escapeHtml(formatCurrency(block.productPrice, getDefaultCurrency()))}</p>`
          : '';
      const button =
        block.productButtonText && block.productButtonLink && isHttpUrl(block.productButtonLink)
          ? `<p style="margin:12px 0 0;"><a href="${escapeHtml(block.productButtonLink)}" style="display:inline-block;background:#0a61d7;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">${escapeHtml(block.productButtonText)}</a></p>`
          : '';
      return `${image}${name}${price}${button}`;
    }
    case 'button':
      if (!block.buttonText || !block.buttonLink || !isHttpUrl(block.buttonLink)) return '';
      return `<p style="margin:16px 0;"><a href="${escapeHtml(block.buttonLink)}" style="display:inline-block;background:#0a61d7;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">${escapeHtml(block.buttonText)}</a></p>`;
    case 'list': {
      const raw = Array.isArray(block.listItems) ? block.listItems : [];
      const items = raw.filter((item) => item?.title);
      if (items.length === 0) return '';
      const rows = items
        .map((item) => {
          const desc = item.description
            ? `<br/><span style="font-weight:normal;color:#555555;">${escapeHtml(item.description)}</span>`
            : '';
          return `<li style="margin:0 0 8px;">${escapeHtml(item.title)}${desc}</li>`;
        })
        .join('');
      return `<ul style="margin:0 0 16px;padding-left:20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111111;">${rows}</ul>`;
    }
    case 'divider':
      return `<hr style="border:none;border-top:1px solid #e6e6e6;margin:16px 0;" />`;
    case 'spacing':
      return `<div style="height:${block.spacingSize === 'small' ? 8 : block.spacingSize === 'large' ? 32 : 16}px;line-height:1;">&nbsp;</div>`;
    default:
      return '';
  }
}

export function buildCampaignEmailHtml(args: {
  introText: string;
  campaignName: string;
  shareUrl: string;
  contentBlocks: unknown;
}): string {
  const blocks = parseBlocks(args.contentBlocks)
    .map(renderBlock)
    .filter(Boolean)
    .map(
      (html) =>
        `<tr><td style="padding:0 24px 16px;font-family:Arial,Helvetica,sans-serif;">${html}</td></tr>`,
    )
    .join('');

  const intro = args.introText.trim()
    ? `<tr><td style="padding:24px 24px 8px;">${paragraphHtml(args.introText)}</td></tr>`
    : '';
  const visual =
    blocks ||
    `<tr><td style="padding:0 24px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#555555;">${escapeHtml(args.campaignName)}</td></tr>`;
  const cta =
    args.shareUrl && isHttpUrl(args.shareUrl)
      ? `<tr><td style="padding:8px 24px 28px;"><a href="${escapeHtml(args.shareUrl)}" style="display:inline-block;background:#0a61d7;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">View campaign</a></td></tr>`
      : '';

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;">
          ${intro}
          ${visual}
          ${cta}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
