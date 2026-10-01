'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowUp, Boxes, Briefcase, MessageCircle, Sparkles } from 'lucide-react';
import {
  copilotRecipeById,
  type CopilotRecipe,
  type CopilotWorkflowRecipe,
} from '@/lib/automations/copilotRecipes';
import { useUserStore } from '@/store/userStore';
import { AiChatMarkdown } from '@/components/AiChatMarkdown';

const FEATURED_IDS = ['low_stock', 'buyer_question', 'sales_jobs'] as const;
const PILL_IDS = ['return_accepted', 'new_buyer', 'order_paid', 'cart_idle'] as const;

const CARD_ICONS = {
  low_stock: Boxes,
  buyer_question: MessageCircle,
  sales_jobs: Briefcase,
} as const;

type ChatLine = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  recipeId?: string;
};

function recipeKey(id: string, field: string) {
  return `recipes.${id}.${field}`;
}

function lineId() {
  return `m_${Math.random().toString(36).slice(2, 10)}`;
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

export function AskAiNavButton() {
  const router = useRouter();
  const tPage = useTranslations('dashboard.automation.page');
  return (
    <button
      type="button"
      onClick={() => router.push('/copilot')}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs font-medium text-black hover:bg-gray-100"
    >
      <Sparkles className="h-3.5 w-3.5 text-[#0a61d7]" />
      {tPage('askAi')}
    </button>
  );
}

export default function AutomationCopilot({
  active = true,
}: {
  active?: boolean;
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
  const hour = new Date().getHours();

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
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [lines, sending, reduceMotion]);

  const askModel = async (text: string, history: ChatLine[]) => {
    const response = await fetch('/api/automations/copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        locale,
        history: history.slice(-8).map((line) => ({ role: line.role, content: line.text })),
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || t('unknown'));
    }
    return (await response.json()) as { reply?: string; recipeId?: string | null };
  };

  const submit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError('');
    setInput('');
    const history = lines;
    const userLine: ChatLine = { id: lineId(), role: 'user', text: trimmed };
    setLines((current) => [...current, userLine]);
    try {
      const payload = await askModel(trimmed, history);
      const recipe = payload.recipeId ? copilotRecipeById(payload.recipeId) : null;
      const reply =
        payload.reply?.trim() ||
        (recipe ? `${t(recipeKey(recipe.id, 'summary'))}\n\n${t(recipeKey(recipe.id, 'logic'))}` : t('unknown'));
      setLines((current) => [
        ...current,
        { id: lineId(), role: 'assistant', text: reply, recipeId: recipe?.id },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unknown'));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const apply = (recipe: CopilotWorkflowRecipe) => {
    router.push(`/automation/new?recipe=${encodeURIComponent(recipe.id)}`);
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
      <div className="mx-auto flex w-full max-w-3xl flex-col rounded-3xl border border-[#d7e6ff] bg-white px-4 py-3 shadow-[0_12px_40px_rgba(10,97,215,0.08)]">
        <textarea
          ref={inputRef}
          value={input}
          rows={3}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder={t('placeholder')}
          className="max-h-40 min-h-[4.5rem] w-full resize-none bg-transparent py-2 text-sm text-black outline-none"
        />
        <div className="mt-1 flex items-end justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {PILL_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className="rounded-full border border-[#e6e6e6] bg-[#f7faff] px-3 py-1 text-xs font-medium text-black hover:bg-white"
                onClick={() => void submit(t(recipeKey(id, 'prompt')))}
              >
                {t(recipeKey(id, 'chip'))}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={sending || !input.trim()}
            aria-label={t('send')}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0a61d7] text-white hover:bg-[#084ba6] disabled:opacity-50"
          >
            <ArrowUp className="h-4 w-4" />
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

  return (
    <div
      className="flex h-[calc(100dvh-4rem)] w-full flex-col bg-gradient-to-b from-[#f4f8ff] to-white motion-reduce:opacity-100"
      style={enterStyle(shown || reduceMotion, 0, reduceMotion)}
    >
      <div ref={listRef} className="flex-1 overflow-y-auto">
        <div className={`mx-auto flex w-full max-w-3xl flex-col px-4 ${empty ? 'min-h-full justify-center py-6' : 'py-6'}`}>
          {empty && (
            <div className="mb-6 text-center">
              <div className="relative mx-auto mb-5 h-16 w-16" style={enterStyle(shown, 80, reduceMotion)}>
                <div className="absolute inset-0 rounded-full bg-[#8eb6ff] opacity-40 blur-md motion-safe:animate-pulse" />
                <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[#eef4fc] shadow-[0_8px_24px_rgba(10,97,215,0.2)] ring-1 ring-[#0a61d7]/15">
                  <Image src="/LakuAI.png" alt="" width={48} height={48} className="h-12 w-12 object-contain" priority />
                </div>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-black" style={enterStyle(shown, 160, reduceMotion)}>
                {firstName ? `${greeting}, ${firstName}` : greeting}
              </h2>
              <p className="mt-2 text-2xl font-semibold text-gray-700" style={enterStyle(shown, 240, reduceMotion)}>
                {askBefore}
                {askWord && <span className="text-[#0a61d7]">{askWord}</span>}
                {askAfter}
              </p>
              <div className="mt-6" style={enterStyle(shown, 340, reduceMotion)}>
                {landingComposer}
              </div>
              <div className="mt-5 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
                {FEATURED_IDS.map((id, index) => {
                  const Icon = CARD_ICONS[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      style={enterStyle(shown, 460 + index * 90, reduceMotion)}
                      className="rounded-2xl border border-[#e6e6e6] bg-white p-4 text-left shadow-sm transition hover:border-[#c5daff] hover:shadow-md"
                      onClick={() => void submit(t(recipeKey(id, 'prompt')))}
                    >
                      <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#f7faff] text-[#0a61d7]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="block text-sm font-semibold text-black">{t(recipeKey(id, 'chip'))}</span>
                      <span className="mt-1 block text-xs leading-5 text-gray-500">{t(recipeKey(id, 'summary'))}</span>
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
                return (
                  <div key={line.id} className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl border border-[#e6e6e6] bg-white px-4 py-3">
                      <p className="mb-1 text-[11px] font-semibold text-[#0a61d7]">{t('assistantLabel')}</p>
                      <AiChatMarkdown content={line.text} size="md" />
                      {workflow && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="rounded-lg bg-[#0a61d7] px-3 py-2 text-xs font-semibold text-white hover:bg-[#084ba6]"
                            onClick={() => apply(workflow)}
                          >
                            {t('reviewCanvas')}
                          </button>
                        </div>
                      )}
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

      {!empty && chatComposer}
    </div>
  );
}
