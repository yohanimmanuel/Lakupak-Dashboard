import type { TourStepDef } from './tourStepTypes';

/** Orders module — keep under ~10 steps; English-only v1. */
export const ordersTourSteps: TourStepDef[] = [
  {
    selector: '[data-tour="orders-page-header"]',
    title: 'Orders management',
    body: 'This is your hub for all marketplace orders: totals, filters, and exports.',
    side: 'bottom',
  },
  {
    selector: '[data-tour="orders-actions"]',
    title: 'Toolbar',
    body: 'Refresh the list, open archived orders, or export to Excel. Replay this walkthrough anytime from Settings → Product tours.',
    side: 'bottom',
  },
  {
    selector: '[data-tour="orders-map"]',
    title: 'Map overview',
    body: 'See where deliveries cluster when location data is available.',
    side: 'top',
  },
  {
    selector: '[data-tour="orders-cards"]',
    title: 'Summary cards',
    body: 'Quick counts and KPIs for the orders you have loaded.',
    side: 'left',
  },
  {
    selector: '[data-tour="orders-table"]',
    title: 'Orders table',
    body: 'Filter by status, payment, and delivery method; open a row to view full order details.',
    side: 'top',
  },
];
