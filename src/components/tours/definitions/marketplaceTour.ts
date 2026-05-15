import type { TourStepDef } from './tourStepTypes';

export const marketplaceTourSteps: TourStepDef[] = [
  {
    selector: '[data-tour="marketplace-page-header"]',
    title: 'Marketplace dashboard',
    body: 'Track how your storefront performs on the wider marketplace.',
    side: 'bottom',
  },
  {
    selector: '[data-tour="marketplace-actions"]',
    title: 'Time range & refresh',
    body: 'Change the reporting window or reload the latest metrics.',
    side: 'bottom',
  },
  {
    selector: '[data-tour="marketplace-quick-stats"]',
    title: 'Quick stats',
    body: 'Published vs total products and what still needs publishing.',
    side: 'bottom',
  },
  {
    selector: '[data-tour="marketplace-distributor"]',
    title: 'Your storefront',
    body: 'Company profile, followers, and buyer-facing signals.',
    side: 'top',
  },
  {
    selector: '[data-tour="marketplace-performance"]',
    title: 'Performance',
    body: 'Views, engagement, and sales trends for marketplace activity.',
    side: 'top',
  },
  {
    selector: '[data-tour="marketplace-products-list"]',
    title: 'Live listings',
    body: 'Published products shoppers see — deep links back to catalog when you need edits.',
    side: 'top',
  },
];
