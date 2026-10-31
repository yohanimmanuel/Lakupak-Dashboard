/** Shared checks for distributor campaign create and update. */

const HEX_COLOR = /^#([0-9a-fA-F]{6})$/;

export const CAMPAIGN_TITLE_MIN = 2;
export const CAMPAIGN_TITLE_MAX = 120;
export const CAMPAIGN_SUBTITLE_MAX = 200;
export const CAMPAIGN_DETAILS_MAX = 4000;

const DEFAULT_BACKGROUND = '#0a61d7';
const DEFAULT_TEXT = '#ffffff';

export type CampaignCreateFields = {
  title: string;
  subtitle: string;
  detailsBody: string;
  backgroundColor: string;
  textColor: string;
  bannerImageUrl: string | null;
  customBannerImageUrl: string | null;
};

export type CampaignPatchFields = Partial<CampaignCreateFields>;

type Ok<T> = { ok: true; fields: T };
type Err = { ok: false; error: string };

function boundedText(
  value: string,
  max: number,
  tooLong: string,
): { ok: true; value: string } | Err {
  const trimmed = value.trim();
  if (trimmed.length > max) return { ok: false, error: tooLong };
  return { ok: true, value: trimmed };
}

function hexColor(
  value: string,
  label: string,
  fallback: string,
): { ok: true; value: string } | Err {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: fallback };
  const match = HEX_COLOR.exec(trimmed);
  if (!match) return { ok: false, error: `${label} must be a hex color.` };
  return { ok: true, value: `#${match[1].toLowerCase()}` };
}

/** `null` or a blank string clears the image. Any other non-string is rejected so it cannot wipe a saved banner. */
function httpsImage(
  value: unknown,
  label: string,
  mode: 'create' | 'patch',
): { ok: true; value: string | null } | Err {
  if (mode === 'create' && value === undefined) return { ok: true, value: null };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') {
    return { ok: false, error: `${label} must be an HTTPS URL.` };
  }
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: `${label} must be an HTTPS URL.` };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, error: `${label} must be an HTTPS URL.` };
  }
  return { ok: true, value: trimmed };
}

function readTitle(value: unknown, required: boolean): { ok: true; value: string } | Err | { ok: true; skip: true } {
  if (typeof value !== 'string') {
    if (required) return { ok: false, error: 'Title is required.' };
    return { ok: true, skip: true };
  }
  const trimmed = value.trim();
  if (trimmed.length < CAMPAIGN_TITLE_MIN) return { ok: false, error: 'Title is required.' };
  if (trimmed.length > CAMPAIGN_TITLE_MAX) return { ok: false, error: 'Title is too long.' };
  return { ok: true, value: trimmed };
}

export function validateCampaignCreateFields(body: Record<string, unknown>): Ok<CampaignCreateFields> | Err {
  const title = readTitle(body.title, true);
  if (!title.ok) return title;
  if ('skip' in title) return { ok: false, error: 'Title is required.' };

  const subtitleRaw = typeof body.subtitle === 'string' ? body.subtitle : '';
  const subtitle = boundedText(subtitleRaw, CAMPAIGN_SUBTITLE_MAX, 'Subtitle is too long.');
  if (!subtitle.ok) return subtitle;

  const detailsRaw = typeof body.detailsBody === 'string' ? body.detailsBody : '';
  const detailsBody = boundedText(detailsRaw, CAMPAIGN_DETAILS_MAX, 'Detail text is too long.');
  if (!detailsBody.ok) return detailsBody;

  const background = hexColor(
    typeof body.backgroundColor === 'string' ? body.backgroundColor : '',
    'Background color',
    DEFAULT_BACKGROUND,
  );
  if (!background.ok) return background;

  const text = hexColor(
    typeof body.textColor === 'string' ? body.textColor : '',
    'Text color',
    DEFAULT_TEXT,
  );
  if (!text.ok) return text;

  const banner = httpsImage(body.bannerImageUrl, 'Banner image', 'create');
  if (!banner.ok) return banner;
  const custom = httpsImage(body.customBannerImageUrl, 'Custom banner image', 'create');
  if (!custom.ok) return custom;

  return {
    ok: true,
    fields: {
      title: title.value,
      subtitle: subtitle.value,
      detailsBody: detailsBody.value,
      backgroundColor: background.value,
      textColor: text.value,
      bannerImageUrl: banner.value,
      customBannerImageUrl: custom.value,
    },
  };
}

export function validateCampaignPatchFields(body: Record<string, unknown>): Ok<CampaignPatchFields> | Err {
  const fields: CampaignPatchFields = {};

  if ('title' in body) {
    const title = readTitle(body.title, false);
    if (!title.ok) return title;
    if (!('skip' in title)) fields.title = title.value;
  }

  if (typeof body.subtitle === 'string') {
    const subtitle = boundedText(body.subtitle, CAMPAIGN_SUBTITLE_MAX, 'Subtitle is too long.');
    if (!subtitle.ok) return subtitle;
    fields.subtitle = subtitle.value;
  }

  if (typeof body.detailsBody === 'string') {
    const detailsBody = boundedText(body.detailsBody, CAMPAIGN_DETAILS_MAX, 'Detail text is too long.');
    if (!detailsBody.ok) return detailsBody;
    fields.detailsBody = detailsBody.value;
  }

  if (typeof body.backgroundColor === 'string') {
    const background = hexColor(body.backgroundColor, 'Background color', DEFAULT_BACKGROUND);
    if (!background.ok) return background;
    fields.backgroundColor = background.value;
  }

  if (typeof body.textColor === 'string') {
    const text = hexColor(body.textColor, 'Text color', DEFAULT_TEXT);
    if (!text.ok) return text;
    fields.textColor = text.value;
  }

  if ('bannerImageUrl' in body) {
    const banner = httpsImage(body.bannerImageUrl, 'Banner image', 'patch');
    if (!banner.ok) return banner;
    fields.bannerImageUrl = banner.value;
  }

  if ('customBannerImageUrl' in body) {
    const custom = httpsImage(body.customBannerImageUrl, 'Custom banner image', 'patch');
    if (!custom.ok) return custom;
    fields.customBannerImageUrl = custom.value;
  }

  return { ok: true, fields };
}
