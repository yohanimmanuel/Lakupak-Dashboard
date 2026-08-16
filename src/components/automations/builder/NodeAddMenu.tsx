'use client';

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bolt, Bot, CircleStop, GitBranch, Zap } from 'lucide-react';
import type { WorkflowType } from '../automationTypes';
import {
  defaultConfigForFields,
  getAllActions,
  getAllTriggers,
} from '@/lib/automations/catalog';
import { defaultLakuAgentConfig } from '@/lib/automations/agentModels';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import type { FlowNodeKind } from './canvasTypes';

export type NodePickerChoice = {
  kind: FlowNodeKind;
  catalogType: string;
  name: string;
  title: string;
  subtitle: string;
  config: Record<string, unknown>;
};

type PickerSection = {
  id: string;
  label: string;
  items: Array<
    NodePickerChoice & {
      icon: React.ReactNode;
      /** Longer purpose text — shown in the picker card only, not on the canvas node. */
      description: string;
    }
  >;
};

const FRAME_MARGIN = 12;
/** Clear the dashboard header (4rem) so the fixed picker is not clipped underneath. */
const FRAME_TOP = 125 + FRAME_MARGIN;
const CARD_WIDTH = 320;
const PREFERRED_MAX_HEIGHT = 420;
const MIN_VISIBLE_HEIGHT = 140;

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <img src="/whatsapp.svg" alt="" className={className} width={16} height={16} />
  );
}

function GmailIcon({ className }: { className?: string }) {
  return <img src="/gmail.svg" alt="" className={className} width={16} height={16} />;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function computePlacement(screenX: number, screenY: number, measuredHeight?: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const frameLeft = FRAME_MARGIN;
  const frameRight = vw - FRAME_MARGIN;
  const frameTop = FRAME_TOP;
  const frameBottom = vh - FRAME_MARGIN;
  const frameWidth = Math.max(0, frameRight - frameLeft);

  const width = Math.min(CARD_WIDTH, frameWidth);
  const left = clamp(screenX - width / 2, frameLeft, frameRight - width);

  const spaceBelow = Math.max(0, frameBottom - (screenY + 8));
  const spaceAbove = Math.max(0, screenY - 8 - frameTop);
  const openDown = spaceBelow >= spaceAbove;

  const available = openDown ? spaceBelow : spaceAbove;
  const preferred = measuredHeight ?? PREFERRED_MAX_HEIGHT;
  const maxHeight = Math.max(
    Math.min(MIN_VISIBLE_HEIGHT, available),
    Math.min(PREFERRED_MAX_HEIGHT, available, preferred),
  );

  const top = openDown
    ? clamp(screenY + 8, frameTop, Math.max(frameTop, frameBottom - maxHeight))
    : clamp(screenY - 8 - maxHeight, frameTop, Math.max(frameTop, frameBottom - maxHeight));

  return { left, top, width, maxHeight };
}

export function NodeAddMenu({
  workflowType: _workflowType,
  screenX,
  screenY,
  onPickAction,
  onCloseAction,
}: {
  workflowType: WorkflowType;
  screenX: number;
  screenY: number;
  onPickAction: (choice: NodePickerChoice) => void;
  onCloseAction: () => void;
}) {
  const { tBuilder, translateTrigger, translateAction } = useAutomationTranslations();
  const triggers = getAllTriggers();
  const actions = getAllActions();
  const cardRef = useRef<HTMLDivElement>(null);
  // Avoid window access during SSR; useLayoutEffect sets the real placement on the client.
  const [placement, setPlacement] = useState({
    left: FRAME_MARGIN,
    top: FRAME_TOP,
    width: CARD_WIDTH,
    maxHeight: PREFERRED_MAX_HEIGHT,
  });

  const sections: PickerSection[] = [
    {
      id: 'triggers',
      label: tBuilder('pickerTriggers'),
      items: triggers.map((t) => ({
        kind: 'trigger' as const,
        catalogType: t.type,
        name: '',
        title: translateTrigger(t.type),
        subtitle: tBuilder('nodeTrigger'),
        description: tBuilder.has(`triggerHints.${t.type}`)
          ? tBuilder(`triggerHints.${t.type}`)
          : tBuilder('nodeTrigger'),
        config: defaultConfigForFields(t.fields),
        icon: <Bolt className="h-4 w-4 shrink-0 text-[#0a61d7]" />,
      })),
    },
    {
      id: 'actions',
      label: tBuilder('pickerActions'),
      items: actions.map((a) => ({
        kind: 'action' as const,
        catalogType: a.type,
        name: '',
        title: translateAction(a.type),
        subtitle: tBuilder('nodeAction'),
        description: tBuilder.has(`actionHints.${a.type}`)
          ? tBuilder(`actionHints.${a.type}`)
          : tBuilder('nodeAction'),
        config: defaultConfigForFields(a.fields),
        icon: <Zap className="h-4 w-4 shrink-0 text-[#0a61d7]" />,
      })),
    },
    {
      id: 'ai',
      label: tBuilder('pickerAi'),
      items: [
        {
          kind: 'agent' as const,
          catalogType: 'laku_agent',
          name: '',
          title: tBuilder('nodeAgent'),
          subtitle: tBuilder('nodeAgent'),
          description: tBuilder('agentSubtitle'),
          config: defaultLakuAgentConfig(),
          icon: <Bot className="h-4 w-4 shrink-0 text-[#0a61d7]" />,
        },
      ],
    },
    {
      id: 'logic',
      label: tBuilder('pickerLogic'),
      items: [
        {
          kind: 'condition' as const,
          catalogType: 'yes_no',
          name: '',
          title: tBuilder('nodeCondition'),
          subtitle: tBuilder('conditionSubtitle'),
          description: tBuilder('conditionHint'),
          config: { rule: 'ai_handoff_requested' },
          icon: <GitBranch className="h-4 w-4 shrink-0 text-[#0a61d7]" />,
        },
        {
          kind: 'end' as const,
          catalogType: 'stay_in_cs',
          name: '',
          title: tBuilder('endStayInCs'),
          subtitle: tBuilder('nodeEnd'),
          description: tBuilder('endStayInCsHint'),
          config: {},
          icon: <CircleStop className="h-4 w-4 shrink-0 text-[#0a61d7]" />,
        },
        {
          kind: 'end' as const,
          catalogType: 'stop',
          name: '',
          title: tBuilder('endStop'),
          subtitle: tBuilder('nodeEnd'),
          description: tBuilder('endStopHint'),
          config: {},
          icon: <CircleStop className="h-4 w-4 shrink-0 text-[#0a61d7]" />,
        },
      ],
    },
    {
      id: 'apps',
      label: tBuilder('pickerApps'),
      items: [
        {
          kind: 'app' as const,
          catalogType: 'app_webhook',
          name: '',
          title: tBuilder('appWebhook'),
          subtitle: tBuilder('nodeApp'),
          description: tBuilder('appWebhookHint'),
          config: {
            connected: false,
            phone: '',
            phoneNumberId: '',
            wabaId: '',
            accessToken: '',
          },
          icon: <WhatsAppIcon className="h-4 w-4 shrink-0" />,
        },
        {
          kind: 'app' as const,
          catalogType: 'app_email',
          name: '',
          title: tBuilder('appEmail'),
          subtitle: tBuilder('nodeApp'),
          description: tBuilder('appEmailHint'),
          config: { connected: false, email: '', appPassword: '' },
          icon: <GmailIcon className="h-4 w-4 shrink-0" />,
        },
      ],
    },
  ].filter((section) => section.items.length > 0);

  const sectionKey = useMemo(
    () => sections.map((s) => `${s.id}:${s.items.length}`).join('|'),
    [sections],
  );

  useLayoutEffect(() => {
    const measure = () => {
      const measured = cardRef.current?.scrollHeight;
      setPlacement(computePlacement(screenX, screenY, measured));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [screenX, screenY, sectionKey]);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] cursor-default bg-transparent"
        aria-label={tBuilder('closePicker')}
        onClick={onCloseAction}
      />
      <div
        ref={cardRef}
        className="fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-[#e6e6e6] bg-white/95 shadow-md backdrop-blur-sm"
        style={{
          left: placement.left,
          top: placement.top,
          width: placement.width,
          maxHeight: placement.maxHeight,
        }}
        role="menu"
        aria-label={tBuilder('pickerTitle')}
      >
        <div className="shrink-0 border-b border-gray-100 px-3 py-2.5">
          <p className="text-sm font-semibold text-black">{tBuilder('pickerTitle')}</p>
          <p className="mt-0.5 text-[11px] text-gray-500">{tBuilder('pickerHint')}</p>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 py-2">
          {sections.map((section) => (
            <div key={section.id}>
              <p className="px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {section.label}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <button
                    key={`${item.kind}-${item.catalogType}`}
                    type="button"
                    role="menuitem"
                    onClick={() => onPickAction(item)}
                    className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-[#f7faff]"
                  >
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        item.catalogType === 'app_webhook'
                          ? 'bg-[#25D366]'
                          : item.catalogType === 'app_email'
                            ? 'bg-white ring-1 ring-[#e6e6e6]'
                            : 'bg-[#f0f6ff]'
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-black">{item.title}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">
                        {item.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
