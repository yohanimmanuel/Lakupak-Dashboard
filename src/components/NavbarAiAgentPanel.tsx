'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Maximize2, Minimize2, Package, Send, Truck, TrendingUp, X } from 'lucide-react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { useUserStore } from '@/store/userStore';
import { AiChatMarkdown } from '@/components/AiChatMarkdown';
import {
  beginAiChatSend,
  getActiveAiChatSend,
  isAiChatSending,
  isAiChatSessionGenerationCurrent,
  loadAiChatSession,
  patchAiChatSessionIfCurrent,
  saveAiChatSession,
  saveAiChatSessionIfCurrent,
  setActiveAiChatSend,
  type AiChatMessage,
} from '@/lib/lakuAi/aiChatSession';

type ChatMessage = AiChatMessage;

function newId() {
  return `m_${Math.random().toString(36).slice(2, 10)}`;
}

function sessionUserKey(userId: string | number | undefined | null) {
  if (userId == null || userId === '') return 'anon';
  return String(userId);
}

function isHomeSession(session: { onlyWelcome: boolean; messages: ChatMessage[] } | null) {
  if (!session) return true;
  if (session.onlyWelcome) return true;
  return session.messages.length === 0 || session.messages.every((m) => m.id === 'welcome');
}

const PANEL_MOTION_MS = 220;

export function NavbarAiAgentPanel({
  panelId,
  open = true,
  onCloseAction,
  onExitedAction,
}: {
  panelId: string;
  open?: boolean;
  onCloseAction: () => void;
  onExitedAction?: () => void;
}) {
  const tNavbar = useTranslations('dashboard.navbar');
  const locale = useLocale();
  const user = useUserStore((s) => s.user);
  const userKey = sessionUserKey(user?.id);
  const displayName = user?.firstName?.trim() || '';

  const restored = loadAiChatSession(userKey) ?? loadAiChatSession('anon');
  const restoredHome = isHomeSession(restored);

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    restoredHome ? [] : (restored?.messages ?? []),
  );
  const [input, setInput] = useState(() => restored?.input ?? '');
  const [sending, setSending] = useState(() => isAiChatSending(userKey));
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const onlyWelcomeRef = useRef(restoredHome);
  const welcomeShownRef = useRef(true);
  const mountedRef = useRef(true);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const showHome = !sending && isHomeSession({ onlyWelcome: onlyWelcomeRef.current, messages });

  const quickOptions = useMemo(
    () => ({
      financial: {
        title: tNavbar('aiAgentOptionFinancialTitle'),
        subtitle: tNavbar('aiAgentOptionFinancialSubtitle'),
        explore: tNavbar('aiAgentExploreFinancial'),
        prompt: tNavbar('aiAgentOptionFinancialPrompt'),
      },
      products: {
        explore: tNavbar('aiAgentExploreProducts'),
        prompt: tNavbar('aiAgentOptionProductsPrompt'),
      },
      logistics: {
        explore: tNavbar('aiAgentExploreLogistics'),
        prompt: tNavbar('aiAgentOptionLogisticsPrompt'),
      },
    }),
    [tNavbar],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (open) {
      let inner = 0;
      const outer = window.requestAnimationFrame(() => {
        inner = window.requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        window.cancelAnimationFrame(outer);
        window.cancelAnimationFrame(inner);
      };
    }
    setVisible(false);
    const t = window.setTimeout(() => onExitedAction?.(), PANEL_MOTION_MS);
    return () => window.clearTimeout(t);
  }, [open, onExitedAction]);

  const inputMaxLines = expanded ? 5 : 3;

  const resizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const maxHeight = 20 * inputMaxLines + 12;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [inputMaxLines]);

  useEffect(() => {
    const existing =
      loadAiChatSession(userKey) ??
      (userKey !== 'anon' ? loadAiChatSession('anon') : null);

    if (existing && !isHomeSession(existing)) {
      setMessages(existing.messages);
      setInput(existing.input);
      setSending(isAiChatSending(userKey));
      onlyWelcomeRef.current = false;
      welcomeShownRef.current = true;
      saveAiChatSession({
        userKey,
        messages: existing.messages,
        input: existing.input,
        welcomeDone: true,
        onlyWelcome: false,
        sending: existing.sending || isAiChatSending(userKey),
      });
      return;
    }

    onlyWelcomeRef.current = true;
    welcomeShownRef.current = true;
    setMessages([]);
    setInput(existing?.input ?? '');
    setSending(isAiChatSending(userKey));
    saveAiChatSession({
      userKey,
      messages: [],
      input: existing?.input ?? '',
      welcomeDone: true,
      onlyWelcome: true,
      sending: isAiChatSending(userKey),
    });
  }, [userKey]);

  const resolveSession = useCallback(
    () => loadAiChatSession(userKey) ?? (userKey !== 'anon' ? loadAiChatSession('anon') : null),
    [userKey],
  );

  useEffect(() => {
    const pending = getActiveAiChatSend(userKey);
    if (!pending) {
      const existing = resolveSession();
      if (existing) {
        setMessages(isHomeSession(existing) ? [] : existing.messages);
        setInput(existing.input);
        setSending(Boolean(existing.sending));
        onlyWelcomeRef.current = isHomeSession(existing);
      }
      return;
    }
    setSending(true);
    let cancelled = false;
    void pending.finally(() => {
      if (cancelled) return;
      const existing = resolveSession();
      if (!existing) {
        setSending(false);
        return;
      }
      setMessages(isHomeSession(existing) ? [] : existing.messages);
      setInput(existing.input);
      setSending(Boolean(existing.sending));
      onlyWelcomeRef.current = isHomeSession(existing);
      welcomeShownRef.current = existing.welcomeDone;
    });
    return () => {
      cancelled = true;
    };
  }, [resolveSession, userKey]);

  useEffect(() => {
    saveAiChatSession({
      userKey,
      messages,
      input,
      welcomeDone: welcomeShownRef.current,
      onlyWelcome: onlyWelcomeRef.current,
      sending,
    });
  }, [messages, input, userKey, sending]);

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
  }, [messages, sending, expanded, showHome]);

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

  const sendMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sending || getActiveAiChatSend(userKey)) return;

      onlyWelcomeRef.current = false;
      const userMsg: ChatMessage = { id: newId(), role: 'user', content: text };
      const currentMessages = messagesRef.current.filter((m) => m.id !== 'welcome');
      const historyForApi = currentMessages.map((m) => ({ role: m.role, content: m.content }));
      const messagesWithUser = [...currentMessages, userMsg];
      const { generation, signal } = beginAiChatSend(userKey);

      setMessages(messagesWithUser);
      setInput('');
      setSending(true);
      setError(null);
      saveAiChatSessionIfCurrent(generation, {
        userKey,
        messages: messagesWithUser,
        input: '',
        welcomeDone: true,
        onlyWelcome: false,
        sending: true,
      });

      const task = (async () => {
        try {
          const res = await fetch('/api/laku-ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: text,
              locale,
              history: historyForApi,
            }),
            signal,
          });
          if (!isAiChatSessionGenerationCurrent(generation)) return;

          const payload = (await res.json().catch(() => null)) as
            | { reply?: string; error?: string }
            | null;
          if (!isAiChatSessionGenerationCurrent(generation)) return;

          if (!res.ok) {
            throw new Error(payload?.error || tNavbar('aiAgentError'));
          }
          const reply = String(payload?.reply ?? '').trim();
          if (!reply) throw new Error(tNavbar('aiAgentError'));

          const assistantMsg: ChatMessage = {
            id: newId(),
            role: 'assistant',
            content: reply,
          };
          const latest = loadAiChatSession(userKey);
          const baseMessages = latest?.messages ?? messagesWithUser;
          const withoutDupeAssistant = baseMessages.filter((m) => m.id !== assistantMsg.id);
          const withUser = withoutDupeAssistant.some((m) => m.id === userMsg.id)
            ? withoutDupeAssistant
            : [...withoutDupeAssistant, userMsg];
          const nextMessages = [...withUser, assistantMsg];

          const saved = saveAiChatSessionIfCurrent(generation, {
            userKey,
            messages: nextMessages,
            input: latest?.input ?? '',
            welcomeDone: true,
            onlyWelcome: false,
            sending: false,
          });
          if (!saved) return;

          if (mountedRef.current) {
            setError(null);
            setMessages(nextMessages);
            setSending(false);
          }
        } catch (e) {
          if (!isAiChatSessionGenerationCurrent(generation)) return;
          if (e instanceof DOMException && e.name === 'AbortError') return;
          if (e instanceof Error && e.name === 'AbortError') return;

          const latest = loadAiChatSession(userKey);
          const nextMessages = (latest?.messages ?? messagesWithUser).filter(
            (m) => m.id !== userMsg.id,
          );
          const saved = saveAiChatSessionIfCurrent(generation, {
            userKey,
            messages: nextMessages,
            input: text,
            welcomeDone: true,
            onlyWelcome: nextMessages.length === 0,
            sending: false,
          });
          if (!saved) return;

          if (mountedRef.current) {
            onlyWelcomeRef.current = nextMessages.length === 0;
            setMessages(nextMessages);
            setInput(text);
            setError(e instanceof Error ? e.message : tNavbar('aiAgentError'));
            setSending(false);
          }
        } finally {
          patchAiChatSessionIfCurrent(generation, userKey, { sending: false });
          if (mountedRef.current && !isAiChatSessionGenerationCurrent(generation)) {
            setSending(false);
          }
        }
      })();

      setActiveAiChatSend(userKey, task);
      await task;
    },
    [sending, locale, tNavbar, userKey],
  );

  const send = useCallback(() => {
    void sendMessage(input);
  }, [input, sendMessage]);

  const bubbleText = expanded ? 'text-sm' : 'text-xs';
  const listPad = expanded ? 'px-5 py-5' : 'px-4 py-4';
  const inputMaxClass = expanded ? 'max-h-[112px]' : 'max-h-[72px]';
  const panelMotionClass = `transform-gpu transition-[opacity,transform] duration-200 ease-out ${
    visible
      ? 'opacity-100 translate-y-0'
      : open
        ? 'opacity-0 translate-y-2'
        : 'opacity-0 translate-y-0'
  }`;
  const homeSubtitle = displayName
    ? tNavbar('aiAgentHomeSubtitleNamed', { name: displayName })
    : tNavbar('aiAgentHomeSubtitle');

  const headerActions = (
    <div className="flex items-center gap-0.5 shrink-0">
      {expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100"
          title={tNavbar('aiAgentShrink')}
          aria-label={tNavbar('aiAgentShrink')}
        >
          <Minimize2 size={16} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100"
          title={tNavbar('aiAgentExpand')}
          aria-label={tNavbar('aiAgentExpand')}
        >
          <Maximize2 size={16} />
        </button>
      )}
      <button
        type="button"
        onClick={onCloseAction}
        className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100"
        title={tNavbar('close')}
        aria-label={tNavbar('close')}
      >
        <X size={16} />
      </button>
    </div>
  );

  const chatBody = (
    <>
      <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-[#eef4fc] flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-[#0a61d7]/10">
            <Image
              src="/LakuAI.png"
              alt=""
              width={32}
              height={32}
              className="h-7 w-7 object-contain"
              priority
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 truncate">{tNavbar('aiAgentTitle')}</h2>
            <p className="text-[11px] text-gray-400 truncate">{tNavbar('aiAgentSubtitle')}</p>
          </div>
        </div>
        {headerActions}
      </div>
      <div
        className="h-px shrink-0 bg-gradient-to-r from-transparent via-[#0a61d7]/45 to-transparent"
        aria-hidden
      />

      {showHome ? (
        <div className={`flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center ${listPad}`}>
          <div className={`w-full ${expanded ? 'max-w-lg' : 'max-w-sm'}`}>
            <h3 className={`text-center font-semibold tracking-tight text-gray-900 ${expanded ? 'text-lg' : 'text-base'}`}>
              {tNavbar('aiAgentWelcome')}
            </h3>
            <p className="mt-1.5 text-center text-xs text-gray-500 leading-relaxed">
              {homeSubtitle}
            </p>

            <button
              type="button"
              onClick={() => void sendMessage(quickOptions.financial.prompt)}
              disabled={sending}
              className="mt-6 w-full flex items-center gap-2.5 rounded-full bg-[#eef4fc] px-3 py-2 text-left shadow-[0_1px_0_rgba(10,97,215,0.04)] hover:bg-[#e3eefb] hover:shadow-[0_6px_16px_rgba(10,97,215,0.10)] transition-all disabled:opacity-60"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0a61d7] text-white shrink-0">
                <TrendingUp size={13} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-gray-900">
                  {quickOptions.financial.title}
                </span>
                <span className="block text-[11px] text-gray-500">
                  {quickOptions.financial.subtitle}
                </span>
              </span>
              <ChevronRight size={14} className="text-gray-400 shrink-0" />
            </button>

            <div className="mt-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
              <span className="text-[11px] text-gray-400">{tNavbar('aiAgentExplore')}</span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {(
                [
                  { key: 'financial', icon: TrendingUp, label: quickOptions.financial.explore, prompt: quickOptions.financial.prompt },
                  { key: 'products', icon: Package, label: quickOptions.products.explore, prompt: quickOptions.products.prompt },
                  { key: 'logistics', icon: Truck, label: quickOptions.logistics.explore, prompt: quickOptions.logistics.prompt },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => void sendMessage(opt.prompt)}
                  disabled={sending}
                  className="flex flex-col items-center gap-1.5 rounded-2xl bg-gray-50 px-1.5 py-3 hover:bg-[#eef4fc] hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#0a61d7] shadow-sm">
                    <opt.icon size={14} />
                  </span>
                  <span className="text-[11px] font-medium text-gray-600 text-center leading-snug">
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div ref={listRef} className={`flex-1 min-h-0 overflow-y-auto ${listPad}`}>
          <div className="space-y-3">
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
      )}

      <div className={`shrink-0 ${expanded ? 'px-4 pb-4 pt-1' : 'px-3 pb-3 pt-1'}`}>
        <form
          className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 shadow-[0_1px_0_rgba(15,23,42,0.03)] focus-within:border-[#0a61d7]/40 focus-within:ring-2 focus-within:ring-[#0a61d7]/15"
          onSubmit={(e) => {
            e.preventDefault();
            send();
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
                send();
              }
            }}
            disabled={sending}
            placeholder={tNavbar('aiAgentInputPlaceholder')}
            className={`flex-1 min-w-0 ${inputMaxClass} resize-none bg-transparent py-0.5 text-xs leading-5 text-gray-700 placeholder:text-gray-400 outline-none disabled:opacity-60 overflow-y-auto`}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="p-1.5 rounded-full text-[#0a61d7] hover:bg-[#eef4fc] disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed shrink-0"
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
          className={`fixed top-16 right-4 z-50 w-[min(100vw-2rem,380px)] h-[min(82vh,680px)] flex flex-col bg-white border border-gray-100 rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.14)] overflow-hidden ${panelMotionClass}`}
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
              className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
              onClick={() => setExpanded(false)}
              aria-hidden
            />
            <div
              ref={panelRef}
              id={panelId}
              className={`relative w-full max-w-3xl h-[min(85vh,720px)] flex flex-col bg-white border border-gray-100 rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.16)] overflow-hidden ${panelMotionClass}`}
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
