import type { TourStepDef } from './tourStepTypes';

/** Shell orientation: global chrome plus main sidebar modules (English-only). */
export const shellTourSteps: TourStepDef[] = [
  {
    selector: '[data-tour="nav-sidebar"]',
    title: 'Your workspace',
    body: 'Use the sidebar to navigate between Products, Orders, Offers, Marketplace, Logistics, and Settings.',
    side: 'right',
  },
  {
    selector: '[data-tour="quick-search"]',
    title: 'Quick search',
    body: 'Search across the dashboard from here when you need to find something fast.',
    side: 'bottom',
  },
  {
    selector: '[data-tour="user-menu"]',
    title: 'Your account',
    body: 'Open your profile menu for account settings and sign out.',
    side: 'left',
  },
  {
    selector: '[data-tour="nav-products"]',
    title: 'Products',
    body: 'Manage your catalog: SKUs, pricing, and how items appear to buyers.',
    side: 'right',
  },
  {
    selector: '[data-tour="nav-orders"]',
    title: 'Orders',
    body: 'Track B2B orders, statuses, and fulfillment from the Orders module.',
    side: 'right',
  },
  {
    selector: '[data-tour="nav-offers"]',
    title: 'Offers',
    body: 'Run promotions and special pricing alongside your product catalog.',
    side: 'right',
  },
  {
    selector: '[data-tour="nav-marketplace"]',
    title: 'Marketplace',
    body: 'Browse and work with the wider marketplace beyond your own listings.',
    side: 'right',
  },
  {
    selector: '[data-tour="nav-logistics"]',
    title: 'Logistics',
    body: 'Shipments, carriers, and delivery workflows tied to your orders.',
    side: 'right',
  },
  {
    selector: '[data-tour="nav-settings"]',
    title: 'Settings & tours',
    body: 'Open Settings anytime and use the Product tours tab to replay any walkthrough.',
    side: 'right',
  },
];
