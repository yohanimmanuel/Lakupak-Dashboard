const STORAGE_KEY = 'laku-ai-copilot-workflow';

function readMap(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

/** Workflow created from this Copilot chat. Later reviews edit this id instead of creating another. */
export function readCopilotWorkflowLink(conversationId: string): string | null {
  const id = readMap()[conversationId];
  return typeof id === 'string' && id.trim() ? id : null;
}

export function writeCopilotWorkflowLink(conversationId: string, automationId: string): void {
  if (typeof window === 'undefined' || !conversationId || !automationId) return;
  try {
    const map = readMap();
    map[conversationId] = automationId;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // The workflow is already saved. A full or blocked store must not fail that save.
  }
}
