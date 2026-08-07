'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Maximize2, Minimize2, Send, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useUserStore } from '@/store/userStore';
import { AiChatMarkdown } from '@/components/AiChatMarkdown';
import {
  loadAiChatSession,
  saveAiChatSession,
  type AiChatMessage,
} from '@/lib/lakuAi/aiChatSession';

type ChatMessage = AiChatMessage;

const WELCOME_LOADING_MS = 900;

function newId() {
  return `m_${Math.random().toString(36).slice(2, 10)}`;
}

function sessionUserKey(userId: string | number | undefined | null) {
  if (userId == null || userId === '') return 'anon';
  return String(userId);
}

export function NavbarAiAgentPanel({
  panelId,
  panelRef,
  onCloseAction,
}: {
  panelId: string;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onCloseAction: () => void;
}) {
  const tNavbar = useTranslations('dashboard.navbar');
  const locale = useLocale();
  const user = useUserStore((s) => s.user);
  const userKey = sessionUserKey(user?.id);
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
    user?.company?.name?.trim() ||
    '';

  const welcomeMessage = useMemo((): ChatMessage => {
    const text = displayName
      ? tNavbar('aiAgentGreetingNamed', { name: displayName })
      : tNavbar('aiAgentGreeting');
    return { id: 'welcome', role: 'assistant', content: text };
  }, [displayName, tNavbar]);

  const restored = loadAiChatSession(userKey) ?? loadAiChatSession('anon');

  const [messages, setMessages] = useState<ChatMessage[]>(() => restored?.messages ?? []);
  const [welcomeLoading, setWelcomeLoading] = useState(() => !(restored?.welcomeDone));
  const [input, setInput] = useState(() => restored?.input ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const onlyWelcomeRef = useRef(restored?.onlyWelcome ?? true);
  const welcomeShownRef = useRef(restored?.welcomeDone ?? false);

  const inputMaxLines = expanded ? 5 : 3;

  const resizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    // text-sm leading-5 (20px) × N lines + py-1.5 top/bottom (12px)
    const maxHeight = 20 * inputMaxLines + 12;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [inputMaxLines]);

  // First open: Loading… then welcome. Reopen: restore session (no reset).
  useEffect(() => {
    const existing =
      loadAiChatSession(userKey) ??
      (userKey !== 'anon' ? loadAiChatSession('anon') : null);

    if (existing?.welcomeDone) {
      setMessages(existing.messages);
      setInput(existing.input);
      setWelcomeLoading(false);
      onlyWelcomeRef.current = existing.onlyWelcome;
      welcomeShownRef.current = true;
      saveAiChatSession({
        userKey,
        messages: existing.messages,
        input: existing.input,
        welcomeDone: true,
        onlyWelcome: existing.onlyWelcome,
      });
      return;
    }

    setWelcomeLoading(true);
    welcomeShownRef.current = false;
    onlyWelcomeRef.current = true;
    setMessages([]);
    setInput('');
    const timer = window.setTimeout(() => {
      setMessages([welcomeMessage]);
      setWelcomeLoading(false);
      welcomeShownRef.current = true;
    }, WELCOME_LOADING_MS);
    return () => window.clearTimeout(timer);
    // Welcome copy can refresh via the effect below once shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey]);

  // If name/locale hydrates before the user chats, refresh the welcome bubble.
  useEffect(() => {
    if (!welcomeShownRef.current || !onlyWelcomeRef.current) return;
    setMessages([welcomeMessage]);
  }, [welcomeMessage]);

  // Persist while the panel is open (and on last update before unmount).
  useEffect(() => {
    if (welcomeLoading && messages.length === 0) return;
    saveAiChatSession({
      userKey,
      messages,
      input,
      welcomeDone: welcomeShownRef.current && !welcomeLoading,
      onlyWelcome: onlyWelcomeRef.current,
    });
  }, [messages, input, welcomeLoading, userKey]);

  useEffect(() => {
    inputRef.current?.focus();
    resizeInput();
  }, [resizeInput, expanded]);

  useEffect(() => {
    resizeInput();
  }, [input, resizeInput]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending, welcomeLoading, expanded]);

  useEffect(() => {
    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const getFocusable = (root: HTMLElement) =>
      Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (el) => el.getClientRects().length > 0 && !el.hasAttribute('disabled'),
      );

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (expanded) {
          setExpanded(false);
        } else {
          onCloseAction();
        }
        return;
      }

      if (!expanded || e.key !== 'Tab') return;
      const root = panelRef.current;
      if (!root) return;
      const focusable = getFocusable(root);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = active ? root.contains(active) : false;

      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded, onCloseAction, panelRef]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || welcomeLoading) return;

    onlyWelcomeRef.current = false;
    const userMsg: ChatMessage = { id: newId(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const historyForApi = messages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/laku-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          locale,
          history: historyForApi,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { reply?: string; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(payload?.error || tNavbar('aiAgentError'));
      }
      const reply = String(payload?.reply ?? '').trim();
      if (!reply) throw new Error(tNavbar('aiAgentError'));
      setError(null);
      setMessages((prev) => [...prev, { id: newId(), role: 'assistant', content: reply }]);
    } catch (e) {
      // Drop the unanswered user bubble and put the text back so retry is obvious.
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setInput(text);
      setError(e instanceof Error ? e.message : tNavbar('aiAgentError'));
    } finally {
      setSending(false);
    }
  }, [input, sending, welcomeLoading, messages, locale, tNavbar]);

  const bubbleText = expanded ? 'text-sm' : 'text-xs';
  const listPad = expanded ? 'px-5 py-5' : 'px-4 py-4';
  const inputMaxClass = expanded ? 'max-h-[112px]' : 'max-h-[72px]';

  const headerActions = (
    <div className="flex items-center gap-0.5 shrink-0">
      {expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-gray-400 hover:text-gray-600 p-1.5 rounded hover:bg-gray-100"
          title={tNavbar('aiAgentShrink')}
          aria-label={tNavbar('aiAgentShrink')}
        >
          <Minimize2 size={16} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-gray-400 hover:text-gray-600 p-1.5 rounded hover:bg-gray-100"
          title={tNavbar('aiAgentExpand')}
          aria-label={tNavbar('aiAgentExpand')}
        >
          <Maximize2 size={16} />
        </button>
      )}
      <button
        type="button"
        onClick={onCloseAction}
        className="text-gray-400 hover:text-gray-600 p-1.5 rounded hover:bg-gray-100"
        title={tNavbar('close')}
        aria-label={tNavbar('close')}
      >
        <X size={16} />
      </button>
    </div>
  );

  const chatBody = (
    <>
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[#e8f1fc] flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-[#0a61d7]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 truncate">{tNavbar('aiAgentTitle')}</h2>
            <p className="text-xs text-gray-500 truncate">{tNavbar('aiAgentSubtitle')}</p>
          </div>
        </div>
        {headerActions}
      </div>

      <div ref={listRef} className={`flex-1 min-h-0 overflow-y-auto ${listPad}`}>
        <div className="space-y-3">
          {welcomeLoading && (
            <div className="flex justify-start">
              <div
                className={`rounded-2xl rounded-bl-md bg-gray-100 px-3 py-2 ${bubbleText} text-gray-500 animate-pulse`}
              >
                {tNavbar('aiAgentLoading')}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[min(100%,42rem)] rounded-2xl px-3 py-2 ${bubbleText} leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[#0a61d7] text-white rounded-br-md whitespace-pre-wrap'
                    : 'bg-gray-100 text-gray-800 rounded-bl-md'
                }`}
              >
                {m.role === 'assistant' ? (
                  <AiChatMarkdown content={m.content} size={expanded ? 'md' : 'sm'} />
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div
                className={`rounded-2xl rounded-bl-md bg-gray-100 px-3 py-2 ${bubbleText} text-gray-500 animate-pulse`}
                aria-live="polite"
              >
                <span className="inline-flex items-center gap-1.5">
                  <span>{tNavbar('aiAgentThinking')}</span>
                  <span className="inline-flex gap-0.5" aria-hidden>
                    <span className="h-1 w-1 rounded-full bg-gray-400 animate-pulse [animation-delay:0ms]" />
                    <span className="h-1 w-1 rounded-full bg-gray-400 animate-pulse [animation-delay:150ms]" />
                    <span className="h-1 w-1 rounded-full bg-gray-400 animate-pulse [animation-delay:300ms]" />
                  </span>
                </span>
              </div>
            </div>
          )}
          {error && !sending && (
            <div className="flex justify-start">
              <div
                className={`max-w-[min(100%,42rem)] rounded-2xl rounded-bl-md border border-red-200 bg-red-50 px-3 py-2 ${bubbleText} text-red-700 leading-relaxed`}
                role="alert"
              >
                {error}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={`shrink-0 border-t border-gray-200 ${expanded ? 'p-4' : 'p-3'}`}>
        <form
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 focus-within:ring-2 focus-within:ring-[#0a61d7]/30"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            disabled={sending || welcomeLoading}
            placeholder={tNavbar('aiAgentInputPlaceholder')}
            className={`flex-1 min-w-0 ${inputMaxClass} resize-none bg-transparent py-0.5 text-xs leading-5 text-gray-700 placeholder:text-gray-400 outline-none disabled:opacity-60 overflow-y-auto`}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={sending || welcomeLoading || !input.trim()}
            className="p-1.5 rounded-md text-[#0a61d7] hover:bg-[#e8f1fc] disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed shrink-0"
            aria-label={tNavbar('aiAgentSend')}
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      {!expanded && (
        <div
          ref={panelRef}
          id={panelId}
          data-portal-type="ai-agent"
          className="fixed top-16 right-4 z-50 w-[min(100vw-2rem,380px)] h-[min(70vh,520px)] flex flex-col bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
          role="dialog"
          aria-label={tNavbar('aiAgentTitle')}
        >
          {chatBody}
        </div>
      )}

      {expanded &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6"
            data-portal-type="ai-agent"
          >
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setExpanded(false)}
              aria-hidden
            />
            <div
              ref={panelRef}
              id={panelId}
              className="relative w-full max-w-3xl h-[min(85vh,720px)] flex flex-col bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-label={tNavbar('aiAgentTitle')}
            >
              {chatBody}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
