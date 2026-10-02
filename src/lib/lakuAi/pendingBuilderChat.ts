const STORAGE_KEY = 'laku-ai-builder-pending';

export type PendingChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  recipeId?: string | null;
};

export type PendingBuilderChat = {
  /** Set when the workflow was saved but the thread was not stored yet. */
  attachTo?: string;
  /** Set when these messages already belong to a saved conversation. */
  conversationId?: string | null;
  messages: PendingChatMessage[];
};

export function readPendingBuilderChat(): PendingBuilderChat | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingBuilderChat;
    if (!parsed || !Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePendingBuilderChat(value: PendingBuilderChat): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function clearPendingBuilderChat(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}

/** Stores a new-workflow thread onto the workflow id once that workflow exists. */
export async function attachPendingBuilderChat(automationId: string): Promise<boolean> {
  const pending = readPendingBuilderChat();
  if (!pending?.messages.length) return true;
  if (pending.conversationId) {
    clearPendingBuilderChat();
    return true;
  }
  let ok = false;
  try {
    const response = await fetch('/api/laku-ai/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ automationId, messages: pending.messages }),
    });
    ok = response.ok;
  } catch {
    ok = false;
  }
  if (!ok) {
    writePendingBuilderChat({ ...pending, attachTo: automationId });
    return false;
  }
  clearPendingBuilderChat();
  return true;
}
