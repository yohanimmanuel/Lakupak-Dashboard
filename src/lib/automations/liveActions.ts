import type { ActionType } from '@/lib/automations/catalog';

/** Actions that send real outbound messages or run inbound CS automations. */
export const LIVE_ACTION_TYPES = new Set<ActionType>([
  'replenish_stock',
  'mark_paid_from_proof',
  'notify_dashboard',
  'whatsapp_buyer',
  'share_product_whatsapp',
  'return_confirm_whatsapp',
  'assign_agent_whatsapp',
  'cs_24h_window',
  'cart_winback',
]);

export function isLiveActionType(actionType: string | null | undefined): boolean {
  if (!actionType) return false;
  return LIVE_ACTION_TYPES.has(actionType as ActionType);
}

export function listLiveActionTypes(actionTypes: Array<string | null | undefined>): string[] {
  return actionTypes.filter((t): t is string => isLiveActionType(t));
}
