export type AiChatRole = 'user' | 'assistant';

export type AiChatMessage = {
  id: string;
  role: AiChatRole;
  content: string;
};

export type AiChatSession = {
  userKey: string;
  messages: AiChatMessage[];
  input: string;
  welcomeDone: boolean;
  onlyWelcome: boolean;
  /** True while a chat request is in flight (survives panel close). */
  sending: boolean;
};

/** In-memory session so closing the panel does not wipe the thread. */
let session: AiChatSession | null = null;

/** Per-user in-flight send promises so reopen can wait for that user's reply only. */
const activeSends = new Map<string, Promise<void>>();

/**
 * Bumped on clear (and when starting a tracked send). Completion paths must
 * match this generation before saving/restoring session state.
 */
let sessionGeneration = 0;

/** Per-user abort controllers for in-flight chat fetches. */
const activeAborts = new Map<string, AbortController>();

export function loadAiChatSession(userKey: string): AiChatSession | null {
  if (!session || session.userKey !== userKey) return null;
  return session;
}

export function saveAiChatSession(next: AiChatSession): void {
  session = next;
}

/** Persist only if this send still belongs to the current session generation. */
export function saveAiChatSessionIfCurrent(
  generation: number,
  next: AiChatSession,
): boolean {
  if (generation !== sessionGeneration) return false;
  session = next;
  return true;
}

export function patchAiChatSession(
  userKey: string,
  patch: Partial<Omit<AiChatSession, 'userKey'>>,
): AiChatSession | null {
  if (!session || session.userKey !== userKey) return null;
  session = { ...session, ...patch, userKey };
  return session;
}

export function patchAiChatSessionIfCurrent(
  generation: number,
  userKey: string,
  patch: Partial<Omit<AiChatSession, 'userKey'>>,
): AiChatSession | null {
  if (generation !== sessionGeneration) return null;
  return patchAiChatSession(userKey, patch);
}

export function isAiChatSending(userKey: string): boolean {
  return Boolean(loadAiChatSession(userKey)?.sending) || activeSends.has(userKey);
}

export function getActiveAiChatSend(userKey: string): Promise<void> | null {
  return activeSends.get(userKey) ?? null;
}

export function getAiChatSessionGeneration(): number {
  return sessionGeneration;
}

export function isAiChatSessionGenerationCurrent(generation: number): boolean {
  return generation === sessionGeneration;
}

/**
 * Start a tracked send for the current generation and user.
 * Returns the generation + AbortSignal; abort/clear invalidates this send.
 */
export function beginAiChatSend(userKey: string): {
  generation: number;
  signal: AbortSignal;
} {
  activeAborts.get(userKey)?.abort();
  const controller = new AbortController();
  activeAborts.set(userKey, controller);
  return { generation: sessionGeneration, signal: controller.signal };
}

export function setActiveAiChatSend(
  userKey: string,
  promise: Promise<void> | null,
): void {
  if (!promise) {
    activeSends.delete(userKey);
    return;
  }
  activeSends.set(userKey, promise);
  void promise.finally(() => {
    if (activeSends.get(userKey) === promise) {
      activeSends.delete(userKey);
    }
    if (activeAborts.get(userKey)?.signal.aborted) {
      activeAborts.delete(userKey);
    }
  });
}

export function clearAiChatSession(): void {
  sessionGeneration += 1;
  for (const controller of activeAborts.values()) {
    controller.abort();
  }
  activeAborts.clear();
  activeSends.clear();
  session = null;
}
