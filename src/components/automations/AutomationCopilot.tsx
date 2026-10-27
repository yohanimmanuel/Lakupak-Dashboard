'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { ArrowUp, AlertCircle, /* Boxes, */ EllipsisVertical, History, Loader2, PanelLeftClose, Pencil, Pin, Plus, ShoppingBag, Sparkles, Trash2, TrendingUp, Users, X } from 'lucide-react';
import {
  copilotRecipeById,
  type CopilotRecipe,
  type CopilotWorkflowRecipe,
} from '@/lib/automations/copilotRecipes';
import { useUserStore } from '@/store/userStore';
import { AiChatMarkdown } from '@/components/AiChatMarkdown';
import { packCanvasReply, readCanvasReply, writeCopilotReviewPlan } from '@/lib/lakuAi/copilotReviewPlan';
import { clearPendingBuilderChat } from '@/lib/lakuAi/pendingBuilderChat';
import { writePendingProspectFill } from '@/lib/lakuAi/pendingProspectFill';
import type { WorkflowCanvasEdit, WorkflowFieldUpdate, WorkflowPlanStep } from '@/lib/lakuAi/workflowPlan';
import { readCopilotWorkflowLink, writeCopilotWorkflowLink } from '@/lib/lakuAi/copilotWorkflowLink';
import {
  extractProspectFillsFromReply,
  type ProspectFormFill,
} from '@/lib/salesJobs/prospectFormFill';
import Link from 'next/link';

// MVP pause: omit automate pills (e.g. winback) from empty-state shortcuts
const PILL_IDS = ['margins', 'orders', 'buyers', 'products' /* , 'winback' */] as const;
const DOCK_PILL_IDS = ['margins', 'orders', 'buyers'] as const;

const CARDS = [
  { id: 'margins', kind: 'ask', icon: TrendingUp },
  { id: 'orders', kind: 'ask', icon: ShoppingBag },
  // MVP pause: automation starter card
  // { id: 'restock', kind: 'automate', icon: Boxes },
  { id: 'buyers', kind: 'ask', icon: Users },
] as const;

type ChatLine = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  recipeId?: string;
  plan?: WorkflowPlanStep[];
  edit?: WorkflowCanvasEdit;
  prospectFill?: ProspectFormFill | null;
  prospectFills?: ProspectFormFill[];
  instant?: boolean;
};

type HistoryRow = {
  id: string;
  title: string;
  updatedAt: string;
  automationId: string | null;
  pinned?: boolean;
};

function recipeKey(id: string, field: string) {
  return `recipes.${id}.${field}`;
}

/** Compact outlet list for model follow-ups; never shown in ChatLine.text. */
function summarizeProspectFillsForHistory(fills: ProspectFormFill[]): string {
  const lines = fills
    .slice(0, 12)
    .map((fill) => {
      const name = (fill.storeName || fill.name || '').trim();
      if (!name) return null;
      const parts = [name];
      const address = fill.address?.trim();
      const phone = fill.phone?.trim();
      if (address) parts.push(address.slice(0, 120));
      if (phone && phone !== '-') parts.push(phone.slice(0, 20));
      return `- ${parts.join(' · ')}`;
    })
    .filter((line): line is string => Boolean(line));
  if (!lines.length) return '';
  return `Previously suggested outlets:\n${lines.join('\n')}`;
}

function historyContentForModel(line: ChatLine): string {
  const text = line.text.trim();
  if (line.role !== 'assistant' || !line.prospectFills?.length) return text;
  const summary = summarizeProspectFillsForHistory(line.prospectFills);
  return summary ? `${text}\n\n${summary}` : text;
}

function lineId() {
  return `m_${Math.random().toString(36).slice(2, 10)}`;
}

function TypingReply({
  text,
  reduceMotion,
  instant = false,
  onProgress,
  children,
}: {
  text: string;
  reduceMotion: boolean;
  instant?: boolean;
  onProgress?: () => void;
  children?: React.ReactNode;
}) {
  const [count, setCount] = useState(instant || reduceMotion ? text.length : 0);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const done = count >= text.length;

  useEffect(() => {
    if (instant || reduceMotion) {
      setCount(text.length);
      return;
    }
    const duration = Math.min(2400, Math.max(350, text.length * 3));
    const jumps = Math.max(1, Math.floor(duration / 70));
    const chunk = Math.max(6, Math.ceil(text.length / jumps));
    let frame = 0;
    let start = 0;
    let lastCommit = 0;
    const step = (now: number) => {
      if (!start) start = now;
      const elapsed = now - start;
      const raw = Math.min(text.length, Math.ceil((elapsed / duration) * text.length));
      const next = raw >= text.length ? text.length : Math.min(text.length, Math.ceil(raw / chunk) * chunk);
      if (now - lastCommit >= 50 || next >= text.length) {
        lastCommit = now;
        setCount(next);
        onProgressRef.current?.();
      }
      if (next < text.length) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [instant, reduceMotion, text]);

  return (
    <>
      <AiChatMarkdown content={text.slice(0, count)} size="md" />
      {!done && (
        <span className="mt-1 inline-block h-3.5 w-0.5 bg-[#0a61d7] motion-safe:animate-pulse" aria-hidden />
      )}
      {done ? children : null}
    </>
  );
}

/** Plays once per full page load. */
let copilotEntrancePlayed = false;

function greetingSlot(hour: number): 'greetingMorning' | 'greetingAfternoon' | 'greetingEvening' {
  if (hour < 12) return 'greetingMorning';
  if (hour < 18) return 'greetingAfternoon';
  return 'greetingEvening';
}

function enterStyle(shown: boolean, delayMs: number, reduceMotion: boolean): React.CSSProperties {
  if (reduceMotion) return {};
  return {
    opacity: shown ? 1 : 0,
    transform: shown ? 'translateY(0) scale(1)' : 'translateY(18px) scale(0.98)',
    transition: 'opacity 700ms ease, transform 700ms ease',
    transitionDelay: shown ? `${delayMs}ms` : '0ms',
  };
}

export function AskAiNavButton({
  pressed = false,
  onPressAction,
}: {
  pressed?: boolean;
  onPressAction: () => void;
}) {
  const tPage = useTranslations('dashboard.automation.page');
  return (
    <button
      type="button"
      onClick={onPressAction}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-gray-100 ${
        pressed ? 'border-[#0a61d7] bg-[#f7faff] text-[#0a61d7]' : 'border-[#e6e6e6] bg-white text-black'
      }`}
    >
      <Sparkles className="h-3.5 w-3.5 text-[#0a61d7]" />
      {tPage('askAi')}
    </button>
  );
}

export default function AutomationCopilot({
  active = true,
  surface = 'page',
  automationId = null,
  onCloseAction,
  onApplyWorkflowRecipeAction,
  onApplyWorkflowPlanAction,
  onApplyProspectFillAction,
  canvasSteps = null,
  initialConversationId = null,
  dockEmptyMessage = null,
  onCanvas = false,
}: {
  active?: boolean;
  surface?: 'page' | 'dock';
  automationId?: string | null;
  onCloseAction?: () => void;
  /** When set with onCanvas, puts a workflow draft on the open canvas. Does not save it. */
  onApplyWorkflowRecipeAction?: (recipeId: string) => void;
  onApplyWorkflowPlanAction?: (edit: WorkflowCanvasEdit) => void;
  /** Fills the open prospect create/edit form from a Places result. */
  onApplyProspectFillAction?: (fill: ProspectFormFill) => void;
  /** Steps already on the open canvas, so an edit keeps them. */
  canvasSteps?: WorkflowPlanStep[] | null;
  /** Conversation to reopen, shared with the Copilot page. */
  initialConversationId?: string | null;
  /** Dock empty-state hint. Falls back to the automation copilot copy. */
  dockEmptyMessage?: string | null;
  /** True only when the sticky AI is driving the workflow canvas. */
  onCanvas?: boolean;
}) {
  const t = useTranslations('dashboard.automation.copilot');
  const locale = useLocale();
  const router = useRouter();
  const firstName = useUserStore((state) => state.user?.firstName)?.trim() ?? '';
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [shown, setShown] = useState(copilotEntrancePlayed);
  const [reduceMotion, setReduceMotion] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyMenuRef = useRef<HTMLDivElement>(null);
  const chatMenuRef = useRef<HTMLDivElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const deleteInvokerRef = useRef<HTMLButtonElement | null>(null);
  const historyFocusFallbackRef = useRef<HTMLButtonElement | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const skipAutoloadRef = useRef(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historyMenu, setHistoryMenu] = useState(false);
  const [chatAction, setChatAction] = useState<HistoryRow | null>(null);
  const [chatMenuPos, setChatMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [inlineRename, setInlineRename] = useState(false);
  const [deletingChat, setDeletingChat] = useState<HistoryRow | null>(null);
  const renamingRef = useRef(renamingId);
  const deletingRef = useRef(deletingChat);
  const headerRenameRef = useRef<HTMLInputElement>(null);
  renamingRef.current = renamingId;
  deletingRef.current = deletingChat;
  const hour = new Date().getHours();

  const rememberConversation = (id: string | null) => {
    conversationIdRef.current = id;
    setConversationId(id);
  };

  const toLines = (messages: { role: string; content: string; recipeId?: string | null }[], instant: boolean): ChatLine[] =>
    messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => {
        const saved =
          message.role === 'assistant'
            ? readCanvasReply(message.content)
            : { text: message.content, edit: null as WorkflowCanvasEdit | null, prospectFills: [] as ProspectFormFill[] };
        return {
          id: lineId(),
          role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          text: saved.text,
          recipeId: message.recipeId || undefined,
          plan: saved.edit?.steps ?? undefined,
          edit: saved.edit ?? undefined,
          prospectFill: saved.prospectFills[0] ?? null,
          prospectFills: saved.prospectFills,
          instant,
        };
      });

  const refreshHistory = async () => {
    const generalResponse = await fetch('/api/laku-ai/conversations?scope=general');
    if (!generalResponse.ok) return;
    const generalPayload = (await generalResponse.json()) as { conversations?: HistoryRow[] };
    let rows = generalPayload.conversations ?? [];
    if (surface === 'dock' && automationId) {
      const workflowResponse = await fetch(`/api/laku-ai/conversations?automationId=${encodeURIComponent(automationId)}`);
      if (workflowResponse.ok) {
        const workflowPayload = (await workflowResponse.json()) as { conversations?: HistoryRow[] };
        const seen = new Set(rows.map((row) => row.id));
        rows = [...rows, ...(workflowPayload.conversations ?? []).filter((row) => !seen.has(row.id))];
      }
    }
    rows.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    setHistory(rows);
  };

  const openConversation = async (id: string) => {
    const response = await fetch(`/api/laku-ai/conversations?id=${encodeURIComponent(id)}`);
    if (!response.ok) return;
    const payload = (await response.json()) as {
      conversation?: HistoryRow & { messages?: { role: string; content: string; recipeId?: string | null }[] };
    };
    const conversation = payload.conversation;
    if (!conversation) return;
    const tagged = Boolean(conversation.automationId);
    if (surface === 'page' && tagged) return;
    if (surface === 'dock' && tagged && conversation.automationId !== automationId) return;
    rememberConversation(conversation.id);
    setLines(toLines(conversation.messages ?? [], true));
    setHistoryMenu(false);
    setError('');
    if (surface === 'dock' && !automationId) clearPendingBuilderChat();
  };

  const startNewChat = () => {
    skipAutoloadRef.current = true;
    rememberConversation(null);
    setLines([]);
    setInput('');
    setError('');
    setActionError('');
    setHistoryMenu(false);
    cancelRename();
    if (surface === 'dock' && !automationId) clearPendingBuilderChat();
  };

  const runChatAction = async (kind: 'pin') => {
    if (!chatAction || actionBusy) return;
    const target = chatAction;
    setChatAction(null);
    setHistoryMenu(true);
    setActionBusy(true);
    setActionError('');
    try {
      const response = await fetch('/api/laku-ai/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: target.id, pinned: !target.pinned }),
      });
      if (!response.ok) throw new Error('failed');
      await refreshHistory();
    } catch {
      setActionError(t('history.actionFailed'));
    } finally {
      setActionBusy(false);
    }
  };

  const beginDelete = () => {
    if (!chatAction || actionBusy) return;
    deleteInvokerRef.current = document.querySelector<HTMLButtonElement>(
      `[data-chat-actions][data-conversation-id="${CSS.escape(chatAction.id)}"]`,
    );
    setDeletingChat(chatAction);
    setChatAction(null);
    setHistoryMenu(true);
    setActionError('');
  };

  const confirmDelete = async () => {
    if (!deletingChat || actionBusy) return;
    setActionBusy(true);
    setActionError('');
    const target = deletingChat;
    try {
      const response = await fetch(`/api/laku-ai/conversations?id=${encodeURIComponent(target.id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('failed');
      if (conversationIdRef.current === target.id) startNewChat();
      deleteInvokerRef.current = null;
      setDeletingChat(null);
      setChatAction(null);
      setHistoryMenu(true);
      await refreshHistory();
    } catch {
      setActionError(t('history.actionFailed'));
    } finally {
      setActionBusy(false);
    }
  };

  const beginRename = () => {
    if (!chatAction || actionBusy) return;
    setInlineRename(false);
    setRenamingId(chatAction.id);
    setRenameValue(chatAction.title);
    setActionError('');
    setChatAction(null);
    setHistoryMenu(true);
  };

  const beginHeaderRename = () => {
    if (!conversationId || actionBusy) return;
    const current = history.find((item) => item.id === conversationId);
    if (!current) return;
    setInlineRename(true);
    setRenamingId(conversationId);
    setRenameValue(current.title);
    setActionError('');
    setHistoryMenu(false);
    window.setTimeout(() => headerRenameRef.current?.select(), 0);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setInlineRename(false);
    setRenameValue('');
  };

  const saveRename = async () => {
    if (!renamingId || actionBusy) return;
    const next = renameValue.replace(/\s+/g, ' ').trim();
    if (!next) {
      cancelRename();
      return;
    }
    const current = history.find((item) => item.id === renamingId);
    if (next === current?.title) {
      cancelRename();
      return;
    }
    const fromInline = inlineRename;
    setActionBusy(true);
    setActionError('');
    try {
      const response = await fetch('/api/laku-ai/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: renamingId, title: next }),
      });
      if (!response.ok) throw new Error('failed');
      cancelRename();
      if (!fromInline) setHistoryMenu(true);
      await refreshHistory();
    } catch {
      setActionError(t('history.actionFailed'));
    } finally {
      setActionBusy(false);
    }
  };

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduceMotion(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!active) return;
    if (copilotEntrancePlayed || reduceMotion) {
      copilotEntrancePlayed = true;
      setShown(true);
      return;
    }
    copilotEntrancePlayed = true;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [active, reduceMotion]);

  useEffect(() => {
    if (surface !== 'dock') return;
    const onPointerDown = (event: MouseEvent) => {
      if (renamingRef.current || deletingRef.current) return;
      const raw = event.target;
      const target = raw instanceof Element ? raw : raw instanceof Node ? raw.parentElement : null;
      if (target?.closest('[data-keep-history]')) return;
      if (historyMenuRef.current?.contains(raw as Node)) return;
      setHistoryMenu(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [surface, automationId]);

  useEffect(() => {
    if (!chatAction) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Element;
      if (deleteDialogRef.current?.contains(target)) return;
      if (chatMenuRef.current?.contains(target)) return;
      if (target.closest?.('[data-chat-actions]')) return;
      setChatAction(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleteDialogRef.current) setChatAction(null);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [chatAction]);

  useEffect(() => {
    if (!deletingChat) return;
    const dialog = deleteDialogRef.current;
    dialog?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    return () => {
      const invoker = deleteInvokerRef.current;
      if (invoker?.isConnected) {
        invoker.focus();
        return;
      }
      historyFocusFallbackRef.current?.focus();
    };
  }, [deletingChat]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (surface === 'page') {
        await refreshHistory();
        return;
      }
      if (!cancelled) await refreshHistory();
      if (cancelled || conversationIdRef.current || !initialConversationId) return;
      await openConversation(initialConversationId);
    };
    void load();
    return () => {
      cancelled = true;
    };
    // History refresh stays on this effect. Sends update the list themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, automationId, initialConversationId]);

  const scrollToEnd = () => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'auto' });
  };

  useEffect(() => {
    scrollToEnd();
  }, [lines, sending, reduceMotion]);

  const askModel = async (text: string, history: ChatLine[]) => {
    const workflowMode = onCanvas && Boolean(onApplyWorkflowPlanAction || onApplyWorkflowRecipeAction);
    const response = await fetch('/api/automations/copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        locale,
        onCanvas: workflowMode,
        canvas: workflowMode ? canvasSteps ?? null : null,
        history: history.slice(-8).map((line) => ({
          role: line.role,
          content: historyContentForModel(line),
        })),
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || t('unknown'));
    }
    return (await response.json()) as {
      reply?: string;
      recipeId?: string | null;
      plan?: WorkflowPlanStep[] | null;
      unavailable?: boolean;
      name?: string | null;
      description?: string | null;
      updates?: WorkflowFieldUpdate[] | null;
      prospectFill?: ProspectFormFill | null;
      prospectFills?: ProspectFormFill[] | null;
    };
  };

  const editFromPayload = (payload: {
    plan?: WorkflowPlanStep[] | null;
    name?: string | null;
    description?: string | null;
    updates?: WorkflowFieldUpdate[] | null;
  }): WorkflowCanvasEdit | null => {
    const steps = payload.plan?.length ? payload.plan : null;
    const name = payload.name?.trim() || null;
    const description = payload.description?.trim() || null;
    const updates = payload.updates ?? [];
    if (!steps && !name && !description && updates.length === 0) return null;
    return { steps, name, description, updates };
  };

  const submit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    skipAutoloadRef.current = true;
    setSending(true);
    setError('');
    setInput('');
    const history = lines;
    const userLine: ChatLine = { id: lineId(), role: 'user', text: trimmed };
    setLines((current) => [...current, userLine]);
    try {
      const payload = await askModel(trimmed, history);
      const edit = editFromPayload(payload) ?? readCanvasReply(String(payload.reply ?? '')).edit;
      const recipe = payload.recipeId ? copilotRecipeById(payload.recipeId) : null;
      const rawReply = payload.unavailable
        ? t('featureUnavailable')
        : payload.reply?.trim() ||
          (recipe ? `${t(recipeKey(recipe.id, 'summary'))}\n\n${t(recipeKey(recipe.id, 'logic'))}` : t('unknown'));
      const fromReply = extractProspectFillsFromReply(rawReply);
      const prospectFills =
        payload.prospectFills?.length
          ? payload.prospectFills
          : payload.prospectFill
            ? [payload.prospectFill]
            : fromReply.prospectFills;
      const prospectFill = prospectFills[0] ?? payload.prospectFill ?? null;
      // Visible reply stays plain; askModel history adds a safe fill summary via historyContentForModel.
      const reply = fromReply.text;
      const assistantLine: ChatLine = {
        id: lineId(),
        role: 'assistant',
        text: reply,
        recipeId: recipe?.id,
        plan: edit?.steps ?? undefined,
        edit: edit ?? undefined,
        prospectFill,
        prospectFills,
      };
      setLines((current) => [...current, assistantLine]);
      if (onCanvas && !payload.unavailable && edit) {
        onApplyWorkflowPlanAction?.(edit);
      } else if (onCanvas && !payload.unavailable && recipe?.kind === 'workflow') {
        onApplyWorkflowRecipeAction?.(recipe.id);
      }
      const existingId = conversationIdRef.current;
      const storedReply = packCanvasReply(fromReply.text, edit, prospectFills);
      const response = await fetch('/api/laku-ai/conversations', {
        method: existingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          existingId
            ? {
                conversationId: existingId,
                userContent: trimmed,
                assistantContent: storedReply,
                recipeId: recipe?.id ?? null,
              }
            : {
                automationId: null,
                messages: [
                  { role: 'user', content: trimmed },
                  { role: 'assistant', content: storedReply, recipeId: recipe?.id ?? null },
                ],
              },
        ),
      });
      if (!response.ok) {
        setError(t('history.saveFailed'));
      } else {
        clearPendingBuilderChat();
        const saved = (await response.json()) as { conversation?: { id: string } };
        if (!existingId && saved.conversation?.id) rememberConversation(saved.conversation.id);
        await refreshHistory();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unknown'));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const reviewPlan = (edit: WorkflowCanvasEdit) => {
    writeCopilotReviewPlan(edit);
    const conversationId = conversationIdRef.current;
    const linked = conversationId ? readCopilotWorkflowLink(conversationId) : null;
    const chat = conversationId ? `&chat=${encodeURIComponent(conversationId)}` : '';
    if (linked) {
      if (conversationId) writeCopilotWorkflowLink(conversationId, linked);
      router.push(`/automation/details?id=${encodeURIComponent(linked)}&plan=1${chat}`);
      return;
    }
    router.push(`/automation/new?plan=1${chat}`);
  };

  /** Apply on an open Clients buyer form, or open Add Buyer from any other page. */
  const applyProspectFill = (fill: ProspectFormFill) => {
    if (onApplyProspectFillAction) {
      onApplyProspectFillAction(fill);
      return;
    }
    writePendingProspectFill(fill);
    if (fill.buyerId) {
      router.push(`/clients/buyers/edit/${encodeURIComponent(fill.buyerId)}`);
      return;
    }
    router.push('/clients/buyers/add');
  };

  const apply = (recipe: CopilotWorkflowRecipe) => {
    const conversationId = conversationIdRef.current;
    const linked = conversationId ? readCopilotWorkflowLink(conversationId) : null;
    const targetId = surface === 'dock' && automationId ? automationId : linked;
    const chat = conversationId ? `&chat=${encodeURIComponent(conversationId)}` : '';
    if (targetId) {
      if (conversationId) writeCopilotWorkflowLink(conversationId, targetId);
      router.push(`/automation/details?id=${encodeURIComponent(targetId)}&recipe=${encodeURIComponent(recipe.id)}${chat}`);
      return;
    }
    router.push(`/automation/new?recipe=${encodeURIComponent(recipe.id)}${chat}`);
  };

  const empty = lines.length === 0 && !sending;
  const greeting = t(greetingSlot(hour));
  const ask = t('greetingAsk');
  const highlight = t('greetingAskHighlight');
  const highlightAt = ask.toLowerCase().indexOf(highlight.toLowerCase());
  const askBefore = highlightAt >= 0 ? ask.slice(0, highlightAt) : ask;
  const askWord = highlightAt >= 0 ? ask.slice(highlightAt, highlightAt + highlight.length) : '';
  const askAfter = highlightAt >= 0 ? ask.slice(highlightAt + highlight.length) : '';

  const onComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit(input);
    }
  };

  const landingComposer = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit(input);
      }}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col rounded-2xl border border-[#d7e6ff] bg-white px-3 py-2 shadow-[0_12px_40px_rgba(10,97,215,0.08)]">
        <textarea
          ref={inputRef}
          value={input}
          rows={2}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder={t('placeholder')}
          className="max-h-24 min-h-[2.75rem] w-full resize-none bg-transparent py-1 text-xs text-black outline-none"
        />
        <div className="mt-1 flex items-end justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {PILL_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className="rounded-full border border-[#e6e6e6] bg-[#f7faff] px-2 py-0.5 text-[11px] font-medium text-black hover:bg-white"
                onClick={() => void submit(t(`suggestions.${id}.prompt`))}
              >
                {t(`suggestions.${id}.label`)}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={sending || !input.trim()}
            aria-label={t('send')}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0a61d7] text-white hover:bg-[#084ba6] disabled:opacity-50"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </form>
  );

  const chatComposer = (
    <form
      className="px-4 pb-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(input);
      }}
    >
      <div className="relative mx-auto w-full max-w-3xl">
        <div className="flex items-center rounded-full border border-[#e6e6e6] bg-white py-1.5 pl-5 pr-12">
          <textarea
            ref={inputRef}
            value={input}
            rows={1}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder={t('placeholder')}
            className="max-h-[2.5rem] min-h-[2rem] w-full resize-none bg-transparent py-1.5 text-sm text-black outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={sending || !input.trim()}
          aria-label={t('send')}
          className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-[#0a61d7] text-white hover:bg-[#084ba6] disabled:opacity-50"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    </form>
  );

  const pinnedHistory = history.filter((item) => item.pinned);
  const recentHistory = history.filter((item) => !item.pinned);
  const activeChat = conversationId ? history.find((item) => item.id === conversationId) : null;
  const headerTitle = activeChat?.title ?? t('history.newChat');

  const renderHistoryRow = (item: HistoryRow) => {
    const selected = item.id === conversationId;
    const menuOpen = chatAction?.id === item.id;
    return (
      <div
        key={item.id}
        className={`group flex items-center rounded-lg hover:bg-gray-50 ${
          selected ? 'bg-gray-50 font-semibold text-[#0a61d7]' : 'text-black'
        }`}
      >
        <button
          type="button"
          onClick={() => void openConversation(item.id)}
          className="min-w-0 flex-1 px-3 py-2 text-left"
        >
          <span className="block truncate text-xs">{item.title}</span>
        </button>
        <button
          type="button"
          data-chat-actions
          data-conversation-id={item.id}
          onClick={(event) => {
            if (menuOpen) {
              setChatAction(null);
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            const menuHeight = 120;
            const top = rect.bottom + 4 + menuHeight > window.innerHeight ? rect.top - menuHeight - 4 : rect.bottom + 4;
            setActionError('');
            setChatMenuPos({ top, left: rect.right });
            setChatAction(item);
          }}
          className={`mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 ${
            menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          }`}
          aria-label={t('history.actions')}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <EllipsisVertical className="h-4 w-4" />
        </button>
      </div>
    );
  };

  const historyList = (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        ref={historyFocusFallbackRef}
        onClick={startNewChat}
        className="mb-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs font-medium text-black hover:bg-gray-100"
      >
        <Plus className="h-3.5 w-3.5" />
        {t('history.newChat')}
      </button>
      {actionError && !renamingId && !deletingChat ? (
        <p className="mb-2 px-2 text-xs text-red-700">{actionError}</p>
      ) : null}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {history.length === 0 ? (
          <p className="px-2 py-3 text-xs text-gray-500">{t('history.empty')}</p>
        ) : (
          <>
            {pinnedHistory.length > 0 ? (
              <div className="space-y-1">
                <p className="px-3 pb-1 pt-1 text-[11px] font-medium text-gray-500">{t('history.pinnedSection')}</p>
                {pinnedHistory.map(renderHistoryRow)}
              </div>
            ) : null}
            {recentHistory.length > 0 ? (
              <div className="space-y-1">
                {pinnedHistory.length > 0 ? (
                  <p className="px-3 pb-1 pt-3 text-[11px] font-medium text-gray-500">{t('history.recents')}</p>
                ) : null}
                {recentHistory.map(renderHistoryRow)}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className={surface === 'page' ? 'flex h-[calc(100dvh-4rem)] w-full' : 'flex h-full min-h-0 w-full flex-col bg-white'}>
      {surface === 'page' ? (
        <aside
          className={`h-full shrink-0 overflow-hidden bg-white transition-[width] duration-300 ease-out motion-reduce:transition-none ${
            historyOpen ? 'w-72' : 'w-0'
          }`}
          aria-hidden={!historyOpen}
        >
          <div className="flex h-full w-72 min-h-0 flex-col border-r border-[#e6e6e6] p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-black">{t('history.title')}</p>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e6e6e6] bg-white text-black hover:bg-gray-100"
                aria-label={t('history.collapse')}
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            {historyList}
          </div>
        </aside>
      ) : null}
    <div
      className={
        surface === 'page'
          ? 'relative flex min-w-0 flex-1 flex-col bg-gradient-to-b from-[#f4f8ff] to-white motion-reduce:opacity-100'
          : 'flex min-h-0 flex-1 flex-col'
      }
      style={surface === 'page' ? enterStyle(shown || reduceMotion, 0, reduceMotion) : undefined}
    >
      {surface === 'page' ? (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className={`absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs font-medium text-black transition-all duration-300 ease-out hover:bg-gray-100 motion-reduce:transition-none ${
            historyOpen ? 'pointer-events-none -translate-x-2 opacity-0' : 'translate-x-0 opacity-100'
          }`}
          aria-label={t('history.expand')}
          tabIndex={historyOpen ? -1 : 0}
        >
          <History className="h-4 w-4" />
          {t('history.title')}
        </button>
      ) : null}
      {surface === 'dock' ? (
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[#e6e6e6] px-3 py-2.5">
          {inlineRename && renamingId === conversationId ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <input
                ref={headerRenameRef}
                value={renameValue}
                disabled={actionBusy}
                onChange={(event) => setRenameValue(event.target.value)}
                onBlur={() => void saveRename()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void saveRename();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelRename();
                  }
                }}
                className="min-w-0 flex-1 rounded-md border border-[#0a61d7] bg-white px-2 py-1 text-xs font-semibold text-black outline-none ring-2 ring-[#0a61d7]/20"
                aria-label={t('history.renameLabel')}
                aria-invalid={Boolean(actionError)}
              />
              {actionError ? (
                <p className="max-w-[9rem] shrink-0 text-xs text-red-700">{actionError}</p>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (conversationId) beginHeaderRename();
              }}
              className={`min-w-0 flex-1 truncate text-left text-xs font-semibold ${
                conversationId
                  ? 'text-gray-800 hover:text-[#0a61d7]'
                  : 'cursor-default text-gray-700'
              }`}
              title={conversationId ? t('history.rename') : undefined}
            >
              {headerTitle}
            </button>
          )}
          <div className="flex shrink-0 items-center gap-1">
            <div className="relative" ref={historyMenuRef}>
              <button
                type="button"
                onClick={() => setHistoryMenu((open) => !open)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
                aria-label={t('history.title')}
                aria-expanded={historyMenu}
              >
                <History className="h-4 w-4" />
              </button>
              {historyMenu ? (
                <div data-keep-history className="absolute right-0 z-50 mt-1 flex max-h-80 w-64 flex-col rounded-lg border border-[#e6e6e6] bg-white p-2 shadow-lg">
                  {historyList}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={startNewChat}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
              aria-label={t('history.newChat')}
            >
              <Plus className="h-4 w-4" />
            </button>
            {onCloseAction ? (
              <button
                type="button"
                onClick={onCloseAction}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
                aria-label={t('history.close')}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </header>
      ) : null}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className={`mx-auto flex w-full max-w-3xl flex-col px-4 ${empty ? 'min-h-full justify-center py-6' : 'py-6'}`}>
          {surface === 'dock' && empty && (
            <div className="mx-auto w-full max-w-sm">
              <h2 className="text-center text-base font-semibold tracking-tight text-black">
                {firstName ? `${greeting}, ${firstName}` : greeting}
              </h2>
              <p className="mt-1 text-center text-xs font-medium text-gray-600">
                {dockEmptyMessage ? (
                  dockEmptyMessage
                ) : (
                  <>
                    {askBefore}
                    {askWord && <span className="text-[#0a61d7]">{askWord}</span>}
                    {askAfter}
                  </>
                )}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {DOCK_PILL_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="rounded-full border border-[#e6e6e6] bg-[#f7faff] px-2.5 py-1 text-[11px] font-medium text-black hover:bg-white"
                    onClick={() => void submit(t(`suggestions.${id}.prompt`))}
                  >
                    {t(`suggestions.${id}.label`)}
                  </button>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                {CARDS.map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      className="flex w-full items-start gap-2.5 rounded-xl border border-[#e6e6e6] bg-white px-3 py-2.5 text-left transition hover:border-[#c5daff] hover:bg-[#f7faff]"
                      onClick={() => void submit(t(`suggestions.${card.id}.prompt`))}
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef4fc] text-[#0a61d7]">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-black">
                          {t(`suggestions.${card.id}.title`)}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-gray-500">
                          {t(`suggestions.${card.id}.summary`)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {surface === 'page' && empty && (
            <div className="mx-auto mb-4 w-full max-w-2xl text-center">
              <div className="relative mx-auto mb-3 h-11 w-11" style={enterStyle(shown, 80, reduceMotion)}>
                <div className="absolute inset-0 rounded-full bg-[#8eb6ff] opacity-40 blur-md motion-safe:animate-pulse" />
                <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#8eb6ff] to-[#0a61d7] shadow-[0_8px_24px_rgba(10,97,215,0.2)]">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-black" style={enterStyle(shown, 160, reduceMotion)}>
                {firstName ? `${greeting}, ${firstName}` : greeting}
              </h2>
              <p className="mt-1 text-sm font-medium text-gray-700" style={enterStyle(shown, 240, reduceMotion)}>
                {askBefore}
                {askWord && <span className="text-[#0a61d7]">{askWord}</span>}
                {askAfter}
              </p>
              <div className="mt-4" style={enterStyle(shown, 340, reduceMotion)}>
                {landingComposer}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-left sm:grid-cols-3">
                {CARDS.map((card, index) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      style={enterStyle(shown, 460 + index * 70, reduceMotion)}
                      className="rounded-xl border border-[#e6e6e6] bg-white p-3 text-left transition hover:border-[#c5daff]"
                      onClick={() => void submit(t(`suggestions.${card.id}.prompt`))}
                    >
                      <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-[#f7faff] text-[#0a61d7]">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span
                        className={`mb-1.5 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          card.kind === 'ask' ? 'bg-[#f7faff] text-[#0a61d7]' : 'bg-[#f3f4f6] text-gray-600'
                        }`}
                      >
                        {t(card.kind === 'ask' ? 'suggestionAsk' : 'suggestionAutomate')}
                      </span>
                      <span className="block text-xs font-semibold text-black">{t(`suggestions.${card.id}.title`)}</span>
                      <span className="mt-1 block text-[11px] leading-4 text-gray-500">{t(`suggestions.${card.id}.summary`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!empty && (
            <div className="space-y-4">
              {lines.map((line) => {
                const recipe: CopilotRecipe | null = line.recipeId ? copilotRecipeById(line.recipeId) : null;
                const workflow = recipe?.kind === 'workflow' ? recipe : null;
                if (line.role === 'user') {
                  return (
                    <div key={line.id} className="flex justify-end">
                      <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-[#0a61d7] px-4 py-3 text-sm text-white">
                        {line.text}
                      </p>
                    </div>
                  );
                }
                const prospectActions =
                  line.prospectFills?.length
                    ? line.prospectFills
                    : line.prospectFill
                      ? [line.prospectFill]
                      : extractProspectFillsFromReply(line.text).prospectFills;
                // MVP pause: hide automation canvas action buttons (logic still runs)
                const showWorkflowAction = false; // Boolean(line.edit || line.plan?.length || workflow);
                const showProspectActions = prospectActions.length > 0;
                return (
                  <div key={line.id} className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl border border-[#e6e6e6] bg-white px-4 py-3">
                      <p className="mb-1 text-[11px] font-semibold text-[#0a61d7]">{t('assistantLabel')}</p>
                      <TypingReply
                        text={extractProspectFillsFromReply(line.text).text}
                        reduceMotion={reduceMotion}
                        instant={line.instant || showProspectActions}
                        onProgress={scrollToEnd}
                      />
                      {showWorkflowAction || showProspectActions ? (
                        <div className="mt-3 space-y-3">
                          {showWorkflowAction ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="rounded-lg bg-[#0a61d7] px-3 py-2 text-xs font-semibold text-white hover:bg-[#084ba6]"
                                onClick={() => {
                                  const nextEdit =
                                    line.edit ??
                                    (line.plan?.length
                                      ? { steps: line.plan, name: null, description: null, updates: [] }
                                      : null);
                                  if (onCanvas && nextEdit && onApplyWorkflowPlanAction) {
                                    onApplyWorkflowPlanAction(nextEdit);
                                    return;
                                  }
                                  if (nextEdit) reviewPlan(nextEdit);
                                  else if (workflow) apply(workflow);
                                }}
                              >
                                {t('reviewCanvas')}
                              </button>
                            </div>
                          ) : null}
                          {prospectActions.map((fill, index) => (
                            <div
                              key={`${line.id}-prospect-${fill.buyerId || fill.customerNumber || index}`}
                              className="rounded-lg border border-[#e6e6e6] bg-[#fafafa] px-3 py-2"
                            >
                              <p className="text-xs font-semibold text-black">{fill.storeName || fill.name}</p>
                              {fill.address ? (
                                <p className="mt-0.5 text-[11px] leading-4 text-gray-500">{fill.address}</p>
                              ) : null}
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Link
                                  href={
                                    fill.buyerId
                                      ? `/clients/buyers/details/${encodeURIComponent(fill.buyerId)}`
                                      : '/clients/buyers'
                                  }
                                  className="rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-gray-50"
                                >
                                  {t('viewProspect')}
                                </Link>
                                <button
                                  type="button"
                                  className="rounded-lg border border-[#0a61d7] bg-[#f7faff] px-3 py-2 text-xs font-semibold text-[#0a61d7] hover:bg-[#eef5ff]"
                                  onClick={() => applyProspectFill(fill)}
                                >
                                  {t('applyProspectFields')}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {sending && (
                <p className="text-xs font-medium text-[#0a61d7] motion-safe:animate-pulse">{t('thinking')}</p>
              )}
              {error && <p className="text-xs text-red-700">{error}</p>}
            </div>
          )}
        </div>
      </div>

      {(surface === 'dock' || !empty) && chatComposer}
     </div>
      {chatAction && chatMenuPos && typeof document !== 'undefined'
        ? createPortal(
        <div
          ref={chatMenuRef}
          data-keep-history
          role="menu"
          onMouseDown={(event) => event.stopPropagation()}
          className="fixed z-[80] w-40 -translate-x-full rounded-lg border border-[#e6e6e6] bg-white py-1 shadow-lg"
          style={{ top: chatMenuPos.top, left: chatMenuPos.left }}
        >
          {actionError ? <p className="px-3 py-1.5 text-xs text-red-700">{actionError}</p> : null}
          <button
            type="button"
            role="menuitem"
            disabled={actionBusy}
            onClick={() => void runChatAction('pin')}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-black hover:bg-gray-50 disabled:opacity-50"
          >
            <Pin className="h-3.5 w-3.5" />
            {chatAction.pinned ? t('history.unpin') : t('history.pin')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={actionBusy}
            onClick={beginRename}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-black hover:bg-gray-50 disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t('history.rename')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={actionBusy}
            onClick={beginDelete}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('history.delete')}
          </button>
        </div>,
        document.body,
      ) : null}
      {renamingId && !inlineRename && typeof document !== 'undefined'
        ? createPortal(
        <div
          data-keep-history
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-chat-title"
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !actionBusy) {
              cancelRename();
              setHistoryMenu(true);
            }
          }}
        >
          <form
            className="relative mx-4 flex w-full max-w-sm flex-col overflow-hidden rounded-lg border border-[#e6e6e6] bg-white"
            onSubmit={(event) => {
              event.preventDefault();
              void saveRename();
            }}
          >
            <button
              type="button"
              className="absolute right-4 top-4 z-10 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              onClick={() => {
                cancelRename();
                setHistoryMenu(true);
              }}
              disabled={actionBusy}
              aria-label={t('history.close')}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 p-3 pr-10">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0a61d7]">
                <Pencil className="h-5 w-5 text-white" />
              </div>
              <h2 id="rename-chat-title" className="text-md font-bold text-black">
                {t('history.renameTitle')}
              </h2>
            </div>
            <div className="border-b border-gray-200" />
            <div className="p-4">
              {actionError ? <p className="mb-2 text-xs text-red-700">{actionError}</p> : null}
              <label htmlFor="rename-chat-input" className="mb-1 block text-xs font-medium text-gray-700">
                {t('history.renameLabel')}
              </label>
              <input
                id="rename-chat-input"
                autoFocus
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                className="w-full rounded-lg border border-[#e6e6e6] bg-white px-3 py-1.5 text-xs text-black outline-none"
              />
            </div>
            <div className="border-t border-gray-200" />
            <div className="flex justify-end gap-2 p-3">
              <button
                type="button"
                className="px-4 py-2 text-sm text-gray-600 transition-colors hover:text-gray-800"
                onClick={() => {
                  setRenamingId(null);
                  setHistoryMenu(true);
                }}
                disabled={actionBusy}
              >
                {t('history.cancel')}
              </button>
              <button
                type="submit"
                disabled={actionBusy || !renameValue.trim()}
                className="rounded-lg bg-[#0a61d7] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#084ba6] disabled:opacity-50"
              >
                {t('history.renameSave')}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      ) : null}
      {deletingChat && typeof document !== 'undefined'
        ? createPortal(
        <div
          ref={deleteDialogRef}
          data-keep-history
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-chat-title"
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              if (!actionBusy) {
                setDeletingChat(null);
                setHistoryMenu(true);
              }
              return;
            }
            if (event.key !== 'Tab') return;
            const dialog = deleteDialogRef.current;
            if (!dialog) return;
            const items = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled])'));
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }}
        >
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 w-full max-w-sm mx-4">
            <h2 id="delete-chat-title" className="text-lg font-bold mb-2 text-red-500">
              {t('history.deleteTitle')}
            </h2>
            {actionError ? (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="text-red-700 text-sm">{actionError}</span>
              </div>
            ) : null}
            <p className="mb-1 text-sm font-medium text-black truncate">{deletingChat.title}</p>
            <p className="mb-4 text-gray-500">{t('history.deleteBody')}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
                onClick={() => {
                  setDeletingChat(null);
                  setHistoryMenu(true);
                }}
                disabled={actionBusy}
              >
                {t('history.cancel')}
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void confirmDelete()}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center gap-2 disabled:opacity-50"
              >
                {actionBusy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('history.deleting')}
                  </>
                ) : (
                  t('history.delete')
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
