import type { TourStepDef } from './tourStepTypes';

export const automationTourSteps: TourStepDef[] = [
  {
    selector: '[data-tour="automation-page-header"]',
    title: 'Automation',
    body: 'Build workflows that run across products, offers, clients, and orders.',
    side: 'bottom',
  },
  {
    selector: '[data-tour="automation-actions"]',
    title: 'Toolbar',
    body: 'Refresh the list or start a new workflow.',
    side: 'bottom',
  },
  {
    selector: '[data-tour="automation-stats"]',
    title: 'Workflow status',
    body: 'See how many workflows are active, paused, or still in draft.',
    side: 'bottom',
  },
  {
    selector: '[data-tour="automation-table"]',
    title: 'Workflows',
    body: 'Open a workflow to edit it, or change its status from the list.',
    side: 'top',
  },
];
