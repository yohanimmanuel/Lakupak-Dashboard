'use client';

import React from 'react';
import { AppWindow, Bolt, Bot, GitBranch, Zap } from 'lucide-react';
import type { WorkflowType } from '../automationTypes';
import { getActionsForType, getTriggersForType } from '@/lib/automations/catalog';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import type { FlowNodeKind } from './canvasTypes';

export type NodePickerChoice = {
  kind: FlowNodeKind;
  catalogType: string;
  title: string;
  subtitle: string;
  config: Record<string, unknown>;
};

type IconItem = NodePickerChoice & {
  icon: React.ReactNode;
};

export function NodeAddMenu({
  workflowType,
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
  const triggers = getTriggersForType(workflowType);
  const actions = getActionsForType(workflowType);

  const items: IconItem[] = [
    ...triggers.map((t) => ({
      kind: 'trigger' as const,
      catalogType: t.type,
      title: tBuilder('nodeTrigger'),
      subtitle: translateTrigger(t.type),
      config: {},
      icon: <Bolt className="h-4 w-4" />,
    })),
    ...actions.map((a) => ({
      kind: 'action' as const,
      catalogType: a.type,
      title: tBuilder('nodeAction'),
      subtitle: translateAction(a.type),
      config: a.type === 'notify_dashboard' ? { message: '' } : {},
      icon: <Zap className="h-4 w-4" />,
    })),
    {
      kind: 'agent',
      catalogType: 'laku_agent',
      title: tBuilder('nodeAgent'),
      subtitle: tBuilder('agentSubtitle'),
      config: { note: '' },
      icon: <Bot className="h-4 w-4" />,
    },
    {
      kind: 'condition',
      catalogType: 'yes_no',
      title: tBuilder('nodeCondition'),
      subtitle: tBuilder('conditionSubtitle'),
          config: { expression: '' },
          icon: <GitBranch className="h-4 w-4" />,
        },
    {
      kind: 'app',
      catalogType: 'app_webhook',
      title: tBuilder('appWebhook'),
      subtitle: tBuilder('appWebhookHint'),
      config: { url: '' },
      icon: <AppWindow className="h-4 w-4" />,
    },
    {
      kind: 'app',
      catalogType: 'app_email',
      title: tBuilder('appEmail'),
      subtitle: tBuilder('appEmailHint'),
      config: { to: '' },
      icon: <AppWindow className="h-4 w-4" />,
    },
  ];

  const left = Math.min(Math.max(12, screenX - items.length * 22), window.innerWidth - items.length * 44 - 24);
  const top = Math.min(Math.max(12, screenY - 56), window.innerHeight - 72);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] cursor-default bg-transparent"
        aria-label={tBuilder('closePicker')}
        onClick={onCloseAction}
      />
      <div
        className="fixed z-[70] flex items-center gap-1 rounded-full border border-[#e6e6e6] bg-white/95 px-2 py-1.5 shadow-md backdrop-blur-sm"
        style={{ left, top }}
        role="menu"
        aria-label={tBuilder('pickerTitle')}
      >
        {items.map((item) => (
          <button
            key={`${item.kind}-${item.catalogType}`}
            type="button"
            role="menuitem"
            title={item.subtitle}
            aria-label={item.subtitle}
            onClick={() => onPickAction(item)}
            className="group relative flex h-9 w-9 items-center justify-center rounded-full text-[#0a61d7] hover:bg-[#f7faff]"
          >
            {item.icon}
            <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-sm group-hover:block">
              {item.subtitle}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
