'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, MessageCircle, RefreshCw, Send, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BuyerCsChatTurn } from '@/lib/automations/buyerCsSession';

type ConversationSummary = {
  buyerPhone: string;
  csMode: 'ai' | 'human';
  assignedAgentName?: string;
  lastMessagePreview: string;
  lastMessageAt: string;
};

type SessionDetail = {
  buyerPhone: string;
  csMode: 'ai' | 'human';
  assignedAgentName?: string;
  history: BuyerCsChatTurn[];
};

const REPLY_INPUT_CLASS =
  'w-full resize-none rounded-lg border border-[#e6e6e6] bg-white px-2 py-1.5 text-xs text-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0a61d7]';

function encodeBuyerPhone(phone: string): string {
  return encodeURIComponent(phone);
}

function ChatThread({
  selectedPhone,
  session,
  replyText,
  onReplyTextChange,
  onSend,
  onRelease,
  onBack,
  sending,
  assignedLabel,
  backLabel,
  releaseLabel,
  sendLabel,
  replyPlaceholder,
  historyClassName,
}: {
  selectedPhone: string;
  session: SessionDetail;
  replyText: string;
  onReplyTextChange: (value: string) => void;
  onSend: () => void;
  onRelease: () => void;
  onBack?: () => void;
  sending: boolean;
  assignedLabel: string;
  backLabel: string;
  releaseLabel: string;
  sendLabel: string;
  replyPlaceholder: string;
  historyClassName: string;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <div>
          <p className="text-xs font-semibold text-black">{selectedPhone}</p>
          {session.assignedAgentName && (
            <p className="text-[10px] text-gray-500">
              {assignedLabel}: {session.assignedAgentName}
            </p>
          )}
        </div>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="text-[10px] font-medium text-gray-500 hover:text-black"
          >
            {backLabel}
          </button>
        ) : null}
      </div>
      <div className={`space-y-2 overflow-y-auto px-3 py-2 ${historyClassName}`}>
        {session.history.map((turn, idx) => (
          <div
            key={`${turn.role}-${idx}`}
            className={`whitespace-pre-wrap rounded-md px-2 py-1.5 text-[11px] leading-snug ${
              turn.role === 'user'
                ? 'ml-4 bg-gray-100 text-gray-800'
                : 'mr-4 bg-[#0a61d7]/10 text-gray-900'
            }`}
          >
            {turn.content}
          </div>
        ))}
      </div>
      <div className="border-t border-gray-100 p-2">
        <textarea
          value={replyText}
          onChange={(e) => onReplyTextChange(e.target.value)}
          rows={2}
          placeholder={replyPlaceholder}
          className={REPLY_INPUT_CLASS}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onRelease}
            disabled={sending}
            className="text-[10px] font-medium text-gray-500 hover:text-black disabled:opacity-50"
          >
            {releaseLabel}
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={sending || !replyText.trim()}
            className="inline-flex items-center gap-1 rounded-lg bg-[#0a61d7] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            <Send className="h-3 w-3" />
            {sendLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WhatsAppCsInboxPanel({
  workflowId,
  embedded = false,
}: {
  workflowId: string;
  embedded?: boolean;
}) {
  const t = useTranslations('dashboard.automation.csInbox');
  const titleId = useId();
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const pendingSendRef = useRef<{ text: string; idempotencyKey: string } | null>(null);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullOpen, setFullOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!fullOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setFullOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      expandButtonRef.current?.focus?.();
    };
  }, [fullOpen]);

  const loadConversations = useCallback(async () => {
    if (!workflowId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/automations/whatsapp/conversations?workflowId=${encodeURIComponent(workflowId)}&humanOnly=true`,
      );
      const data = (await res.json()) as {
        conversations?: ConversationSummary[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load inbox');
      setConversations(data.conversations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inbox');
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  const loadSession = useCallback(
    async (buyerPhone: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/automations/whatsapp/conversations/${encodeURIComponent(workflowId)}/${encodeBuyerPhone(buyerPhone)}`,
        );
        const data = (await res.json()) as {
          session?: SessionDetail;
          buyerPhone?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? 'Failed to load chat');
        const s = data.session;
        if (!s) throw new Error('Session not found');
        setSession({
          buyerPhone: data.buyerPhone ?? buyerPhone,
          csMode: s.csMode,
          assignedAgentName: s.assignedAgentName,
          history: s.history ?? [],
        });
        setSelectedPhone(buyerPhone);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load chat');
      } finally {
        setLoading(false);
      }
    },
    [workflowId],
  );

  useEffect(() => {
    void loadConversations();
    const timer = window.setInterval(() => {
      void loadConversations();
      if (selectedPhone) void loadSession(selectedPhone);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [loadConversations, loadSession, selectedPhone]);

  const sendReply = async () => {
    if (!selectedPhone || !replyText.trim()) return;
    const text = replyText.trim();
    if (!pendingSendRef.current || pendingSendRef.current.text !== text) {
      pendingSendRef.current = {
        text,
        idempotencyKey: crypto.randomUUID(),
      };
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/automations/whatsapp/conversations/${encodeURIComponent(workflowId)}/${encodeBuyerPhone(selectedPhone)}/reply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            idempotencyKey: pendingSendRef.current.idempotencyKey,
          }),
        },
      );
      const data = (await res.json()) as { session?: SessionDetail; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to send');
      pendingSendRef.current = null;
      if (data.session) {
        setSession({
          buyerPhone: selectedPhone,
          csMode: data.session.csMode,
          assignedAgentName: data.session.assignedAgentName,
          history: data.session.history ?? [],
        });
      }
      setReplyText('');
      await loadConversations();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const releaseToAi = async () => {
    if (!selectedPhone) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/automations/whatsapp/conversations/${encodeURIComponent(workflowId)}/${encodeBuyerPhone(selectedPhone)}`,
        { method: 'PATCH' },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to release');
      setSelectedPhone(null);
      setSession(null);
      setFullOpen(false);
      await loadConversations();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to release');
    } finally {
      setSending(false);
    }
  };

  const chatLabels = {
    assignedLabel: t('assigned'),
    backLabel: t('back'),
    releaseLabel: t('releaseAi'),
    sendLabel: t('send'),
    replyPlaceholder: t('replyPlaceholder'),
  };

  const chatThread =
    selectedPhone && session ? (
      <ChatThread
        selectedPhone={selectedPhone}
        session={session}
        replyText={replyText}
        onReplyTextChange={setReplyText}
        onSend={() => void sendReply()}
        onRelease={() => void releaseToAi()}
        onBack={() => {
          setSelectedPhone(null);
          setSession(null);
          setFullOpen(false);
        }}
        sending={sending}
        historyClassName="max-h-48"
        {...chatLabels}
      />
    ) : null;

  return (
    <div className={embedded ? undefined : 'rounded-xl border border-gray-100 bg-white p-4 shadow-sm'}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-black">
          <MessageCircle className="h-3.5 w-3.5 text-[#0a61d7]" aria-hidden />
          {t('title')}
        </div>
        <div className="flex items-center gap-1">
          {selectedPhone && session ? (
            <button
              ref={expandButtonRef}
              type="button"
              onClick={() => setFullOpen(true)}
              className="inline-flex items-center gap-1 rounded p-1 text-[11px] font-medium text-[#0a61d7] hover:bg-[#0a61d7]/5"
              aria-label={t('expandChat')}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('expandChat')}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void loadConversations()}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-black"
            aria-label={t('refresh')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      <p className="mb-3 text-[11px] leading-snug text-gray-500">{t('hint')}</p>

      {error && <p className="mb-2 text-[11px] text-red-500">{error}</p>}

      {conversations.length === 0 && !selectedPhone ? (
        <p className="text-[11px] text-gray-500">{t('empty')}</p>
      ) : (
        <div className="space-y-2">
          {!selectedPhone &&
            conversations.map((row) => (
              <button
                key={row.buyerPhone}
                type="button"
                onClick={() => void loadSession(row.buyerPhone)}
                className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-left hover:border-[#0a61d7]/30 hover:bg-white"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-black">{row.buyerPhone}</span>
                  {row.assignedAgentName && (
                    <span className="text-[10px] text-gray-500">{row.assignedAgentName}</span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-600">
                  {row.lastMessagePreview || '—'}
                </p>
              </button>
            ))}

          {!fullOpen && chatThread}
        </div>
      )}

      {mounted &&
        fullOpen &&
        selectedPhone &&
        session &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-3 sm:p-6"
            onClick={() => setFullOpen(false)}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              className="flex max-h-[min(90dvh,40rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#e6e6e6] bg-white shadow-xl outline-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-[#e6e6e6] px-4 py-3">
                <div>
                  <h3 id={titleId} className="text-sm font-bold text-black">
                    {t('fullTitle')}
                  </h3>
                  <p className="text-xs text-gray-500">{selectedPhone}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFullOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-black"
                  aria-label={t('closeFull')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden p-4">
                <ChatThread
                  selectedPhone={selectedPhone}
                  session={session}
                  replyText={replyText}
                  onReplyTextChange={setReplyText}
                  onSend={() => void sendReply()}
                  onRelease={() => void releaseToAi()}
                  sending={sending}
                  historyClassName="max-h-[min(50dvh,24rem)]"
                  {...chatLabels}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
