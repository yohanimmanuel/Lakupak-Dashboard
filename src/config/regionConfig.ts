export interface Region {
  code: string;
  name: string;
  currency: string;
  currencySymbol: string;
  flag: string;
}

export const REGIONS: Region[] = [
  {
    code: 'ID',
    name: 'Indonesia',
    currency: 'IDR',
    currencySymbol: 'Rp',
    flag: '🇮🇩'
  },
  {
    code: 'US',
    name: 'United States',
    currency: 'USD',
    currencySymbol: '$',
    flag: '🇺🇸'
  },
  {
    code: 'SG',
    name: 'Singapore',
    currency: 'SGD',
    currencySymbol: 'S$',
    flag: '🇸🇬'
  },
  {
    code: 'MY',
    name: 'Malaysia',
    currency: 'MYR',
    currencySymbol: 'RM',
    flag: '🇲🇾'
  },
  {
    code: 'TH',
    name: 'Thailand',
    currency: 'THB',
    currencySymbol: '฿',
    flag: '🇹🇭'
  },
  {
    code: 'PH',
    name: 'Philippines',
    currency: 'PHP',
    currencySymbol: '₱',
    flag: '🇵🇭'
  },
  {
    code: 'VN',
    name: 'Vietnam',
    currency: 'VND',
    currencySymbol: '₫',
    flag: '🇻🇳'
  },
  {
    code: 'JP',
    name: 'Japan',
    currency: 'JPY',
    currencySymbol: '¥',
    flag: '🇯🇵'
  },
  {
    code: 'KR',
    name: 'South Korea',
    currency: 'KRW',
    currencySymbol: '₩',
    flag: '🇰🇷'
  },
  {
    code: 'AU',
    name: 'Australia',
    currency: 'AUD',
    currencySymbol: 'A$',
    flag: '🇦🇺'
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    currency: 'GBP',
    currencySymbol: '£',
    flag: '🇬🇧'
  },
  {
    code: 'EU',
    name: 'European Union',
    currency: 'EUR',
    currencySymbol: '€',
    flag: '🇪🇺'
  }
];

export const getRegionByCode = (code: string): Region | undefined => {
  return REGIONS.find(region => region.code === code);
};

export const getRegionByCurrency = (currency: string): Region | undefined => {
  return REGIONS.find(region => region.currency === currency);
};

export const getDefaultRegion = (): Region => {
  return REGIONS.find(region => region.code === 'ID') || REGIONS[0];
};

export const getRegionDisplayName = (region: Region): string => {
  return `${region.flag} ${region.name}`;
};

export const getCurrencyDisplayName = (region: Region): string => {
  return `${region.currencySymbol} ${region.currency}`;
};
