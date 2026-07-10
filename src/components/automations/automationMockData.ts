import { AutomationWorkflow } from './automationTypes';

/**
 * Temporary mock workflows used while the Automations module is UI-only.
 * Replace with real data once the workflow engine/persistence is built.
 */
export const MOCK_WORKFLOWS: AutomationWorkflow[] = [
  {
    id: 'wf-001',
    name: 'Auto-restock low inventory products',
    description: 'Create a draft purchase order when stock drops below threshold.',
    type: 'product_offers',
    trigger: 'Stock below threshold',
    status: 'active',
    runs: 128,
    lastRun: '2026-07-08T06:30:00.000Z',
    createdAt: '2026-05-02T09:00:00.000Z',
  },
  {
    id: 'wf-002',
    name: 'Weekly discount on slow-moving items',
    description: 'Apply a promotion to products with no sales in the last 30 days.',
    type: 'product_offers',
    trigger: 'Every Monday, 08:00',
    status: 'active',
    runs: 12,
    lastRun: '2026-07-06T01:00:00.000Z',
    createdAt: '2026-05-18T10:15:00.000Z',
  },
  {
    id: 'wf-003',
    name: 'Welcome new leads with intro message',
    description: 'Send a WhatsApp introduction when a new buyer registers.',
    type: 'lead_management',
    trigger: 'New buyer registered',
    status: 'active',
    runs: 340,
    lastRun: '2026-07-09T14:12:00.000Z',
    createdAt: '2026-04-11T07:45:00.000Z',
  },
  {
    id: 'wf-004',
    name: 'Assign delivery fleet on payment',
    description: 'Auto-assign the nearest available fleet when an order is paid.',
    type: 'order_logistics',
    trigger: 'Order status = Paid',
    status: 'paused',
    runs: 76,
    lastRun: '2026-06-28T11:05:00.000Z',
    createdAt: '2026-03-22T13:30:00.000Z',
  },
  {
    id: 'wf-005',
    name: 'Cart abandonment reminder',
    description: 'Remind buyers 24 hours after leaving items in their cart.',
    type: 'marketing',
    trigger: 'Cart idle for 24 hours',
    status: 'draft',
    runs: 0,
    lastRun: null,
    createdAt: '2026-07-01T16:20:00.000Z',
  },
];
