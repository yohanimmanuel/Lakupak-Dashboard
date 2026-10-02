const TITLE_LIMIT = 40;

/** Short label from the first user message. Long text is cut on a word, under 40 characters. */
export function conversationTitle(firstMessage: string): string {
  const clean = firstMessage.replace(/\s+/g, ' ').trim();
  if (!clean) return 'New chat';
  if (clean.length <= TITLE_LIMIT) return clean;
  const slice = clean.slice(0, TITLE_LIMIT);
  const space = slice.lastIndexOf(' ');
  const base = space >= 16 ? slice.slice(0, space) : slice.slice(0, TITLE_LIMIT - 3);
  return `${base.trimEnd()}...`;
}

export type ConversationListScope =
  | { kind: 'general' }
  | { kind: 'automation'; automationId: string };

/** General Copilot lists only untagged threads. A workflow dock lists only that workflow. */
export function conversationListWhere(userId: number, scope: ConversationListScope) {
  if (scope.kind === 'general') return { userId, automationId: null };
  return { userId, automationId: scope.automationId };
}
