import type { ActionType } from '@/lib/automations/catalog';

/** Actions that run without WhatsApp / external messaging. */
export const LIVE_ACTION_TYPES = new Set<ActionType>([
  'replenish_stock',
  'mark_paid_from_proof',
  'notify_dashboard',
]);

export function isLiveActionType(actionType: string | null | undefined): boolean {
  if (!actionType) return false;
  return LIVE_ACTION_TYPES.has(actionType as ActionType);
}

export function listLiveActionTypes(actionTypes: Array<string | null | undefined>): string[] {
  return actionTypes.filter((t): t is string => isLiveActionType(t));
}
