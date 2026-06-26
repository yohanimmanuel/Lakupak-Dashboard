import marketingEn from '@/messages/dashboard/marketing-en.json';
import marketingId from '@/messages/dashboard/marketing-id.json';

export type CampaignShareLocale = 'en' | 'id';

export function normalizeCampaignShareLocale(value?: string | null): CampaignShareLocale {
  const normalized = value?.toLowerCase();
  return normalized?.startsWith('id') ? 'id' : 'en';
}


export const CAMPAIGN_SHARE_MESSAGES: Record<CampaignShareLocale, Record<string, unknown>> = {
  en: { dashboard: { marketing: marketingEn } },
  id: { dashboard: { marketing: marketingId } },
};
