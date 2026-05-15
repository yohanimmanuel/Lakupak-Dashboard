import type { TourStepDef } from './tourStepTypes';

export const logisticsTourSteps: TourStepDef[] = [
  {
    selector: '[data-tour="logistics-page-header"]',
    title: 'Logistics',
    body: 'Monitor fleets, drivers, and delivery progress across your network.',
    side: 'bottom',
  },
  {
    selector: '[data-tour="logistics-actions"]',
    title: 'Toolbar',
    body: 'Refresh data, export fleet rows, or add a new fleet and driver.',
    side: 'bottom',
  },
  {
    selector: '[data-tour="logistics-fleet-list"]',
    title: 'Fleets & drivers',
    body: 'Pick a fleet or manage drivers; lists stay in sync after changes.',
    side: 'right',
  },
  {
    selector: '[data-tour="logistics-fleet-details"]',
    title: 'Fleet details',
    body: 'Route, vehicle, customers, and open full tracking when you need more.',
    side: 'left',
  },
];
