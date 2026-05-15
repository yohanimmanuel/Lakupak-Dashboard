import type { TourStepDef } from './tourStepTypes';

export const offersTourSteps: TourStepDef[] = [
  {
    selector: '[data-tour="offers-page-header"]',
    title: 'Offers & incentives',
    body: 'Create discounts and promotions tied to your catalog.',
    side: 'bottom',
  },
  {
    selector: '[data-tour="offers-actions"]',
    title: 'Actions',
    body: 'Export your offers or jump straight to creating a new one.',
    side: 'bottom',
  },
  {
    selector: '[data-tour="offers-stats"]',
    title: 'Performance',
    body: 'See how offers are performing at a glance.',
    side: 'left',
  },
  {
    selector: '[data-tour="offers-tabs"]',
    title: 'Views',
    body: 'Switch between all offers, discounts, and promotions.',
    side: 'bottom',
  },
  {
    selector: '[data-tour="offers-table"]',
    title: 'Offers table',
    body: 'Review status, dates, and usage; refine with filters above the list.',
    side: 'top',
  },
];
