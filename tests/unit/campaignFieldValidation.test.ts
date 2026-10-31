import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_DETAILS_MAX,
  CAMPAIGN_SUBTITLE_MAX,
  CAMPAIGN_TITLE_MAX,
  validateCampaignCreateFields,
  validateCampaignPatchFields,
} from '@/lib/offers/campaignFieldValidation';

describe('campaign field validation', () => {
  it('accepts a create payload and normalizes hex colors', () => {
    const result = validateCampaignCreateFields({
      title: '  Weekend sale  ',
      subtitle: 'Stock up',
      detailsBody: 'Terms apply',
      backgroundColor: '#0A61D7',
      textColor: '#FFFFFF',
      bannerImageUrl: 'https://res.cloudinary.com/demo/image.jpg',
      customBannerImageUrl: '',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fields.title).toBe('Weekend sale');
    expect(result.fields.backgroundColor).toBe('#0a61d7');
    expect(result.fields.textColor).toBe('#ffffff');
    expect(result.fields.bannerImageUrl).toBe('https://res.cloudinary.com/demo/image.jpg');
    expect(result.fields.customBannerImageUrl).toBeNull();
  });

  it('rejects a short title, a non-hex color, and a non-HTTPS image', () => {
    expect(validateCampaignCreateFields({ title: 'A' }).ok).toBe(false);
    expect(validateCampaignCreateFields({ title: 'Sale', backgroundColor: 'red' })).toEqual({
      ok: false,
      error: 'Background color must be a hex color.',
    });
    expect(
      validateCampaignCreateFields({
        title: 'Sale',
        customBannerImageUrl: 'http://example.com/banner.png',
      }),
    ).toEqual({
      ok: false,
      error: 'Custom banner image must be an HTTPS URL.',
    });
  });

  it('rejects text over the length limits on patch and leaves omitted fields out', () => {
    const tooLong = validateCampaignPatchFields({
      subtitle: 'x'.repeat(CAMPAIGN_SUBTITLE_MAX + 1),
    });
    expect(tooLong).toEqual({ ok: false, error: 'Subtitle is too long.' });

    const details = validateCampaignPatchFields({
      detailsBody: 'y'.repeat(CAMPAIGN_DETAILS_MAX + 1),
    });
    expect(details.ok).toBe(false);

    const title = validateCampaignPatchFields({ title: 'z'.repeat(CAMPAIGN_TITLE_MAX + 1) });
    expect(title).toEqual({ ok: false, error: 'Title is too long.' });

    const partial = validateCampaignPatchFields({ textColor: '#112233' });
    expect(partial).toEqual({ ok: true, fields: { textColor: '#112233' } });
  });

  it('clears a banner only for null and rejects a wrong type on patch', () => {
    expect(validateCampaignPatchFields({ bannerImageUrl: null })).toEqual({
      ok: true,
      fields: { bannerImageUrl: null },
    });
    expect(validateCampaignPatchFields({ bannerImageUrl: 12 })).toEqual({
      ok: false,
      error: 'Banner image must be an HTTPS URL.',
    });
    expect(validateCampaignPatchFields({ customBannerImageUrl: { url: 'https://cdn.example/a.png' } })).toEqual({
      ok: false,
      error: 'Custom banner image must be an HTTPS URL.',
    });
    const created = validateCampaignCreateFields({ title: 'Sale', bannerImageUrl: false });
    expect(created).toEqual({ ok: false, error: 'Banner image must be an HTTPS URL.' });
  });
});