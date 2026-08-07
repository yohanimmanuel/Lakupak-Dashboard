export type AiChatRole = 'user' | 'assistant';

export type AiChatMessage = {
  id: string;
  role: AiChatRole;
  content: string;
};

type AiChatSession = {
  userKey: string;
  messages: AiChatMessage[];
  input: string;
  welcomeDone: boolean;
  onlyWelcome: boolean;
};

/** In-memory session so closing the panel does not wipe the thread. */
let session: AiChatSession | null = null;

export function loadAiChatSession(userKey: string): AiChatSession | null {
  if (!session || session.userKey !== userKey) return null;
  return session;
}

export function saveAiChatSession(next: AiChatSession): void {
  session = next;
}

export function clearAiChatSession(): void {
  session = null;
}
