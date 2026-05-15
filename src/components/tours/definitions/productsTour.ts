import type { TourStepDef } from './tourStepTypes';

export const productsTourSteps: TourStepDef[] = [
  {
    selector: '[data-tour="products-page-header"]',
    title: 'Product catalog',
    body: 'Manage SKUs, variants, pricing, and how items appear to buyers.',
    side: 'bottom',
  },
  {
    selector: '[data-tour="products-actions"]',
    title: 'Toolbar',
    body: 'Refresh data, export to Excel, or add a new product from here.',
    side: 'bottom',
  },
  {
    selector: '[data-tour="products-cards"]',
    title: 'Summary cards',
    body: 'Quick KPIs for stock, offers, and catalog health.',
    side: 'left',
  },
  {
    selector: '[data-tour="products-table"]',
    title: 'Products table',
    body: 'Filter, search, edit, and publish — open a row for full product details.',
    side: 'top',
  },
];
