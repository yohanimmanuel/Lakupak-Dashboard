'use client';

import React from 'react';
import { Trash2, Unplug } from 'lucide-react';
import type { WorkflowStatus, WorkflowType } from '../automationTypes';
import { WORKFLOW_TYPES } from '../automationTypes';
import { getActionsForType, getTriggersForType } from '@/lib/automations/catalog';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import { BuilderSelect } from './BuilderSelect';
import type { WorkflowFlowEdge, WorkflowFlowNode } from './canvasTypes';

export type WorkflowDraft = {
  name: string;
  description: string;
  type: WorkflowType;
  status: WorkflowStatus;
  nodes: WorkflowFlowNode[];
  edges: WorkflowFlowEdge[];
};

const fieldClassName =
  'w-full rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7]';

function PanelCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#e6e6e6] bg-white/95 shadow-sm backdrop-blur-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-black">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      </div>
      <div className="space-y-4 px-4 py-4">{children}</div>
    </section>
  );
}

/** Left panel: workflow name / type / description / status */
export function WorkflowDetailsPanel({
  draft,
  onChangeAction,
  nameError,
  formError,
}: {
  draft: WorkflowDraft;
  onChangeAction: (patch: Partial<WorkflowDraft>) => void;
  nameError?: string | null;
  formError?: string | null;
}) {
  const { tBuilder, translateType, translateStatus } = useAutomationTranslations();

  return (
    <PanelCard
      title={tBuilder('workflowDetailsTitle')}
      hint={tBuilder('workflowDetailsHint')}
    >
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-600">{tBuilder('name')}</span>
        <input
          value={draft.name}
          onChange={(e) => onChangeAction({ name: e.target.value })}
          className={`${fieldClassName} ${
            nameError ? 'border-red-500 focus:ring-red-500' : ''
          }`}
          placeholder={tBuilder('namePlaceholder')}
          aria-invalid={Boolean(nameError)}
        />
        {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-600">
          {tBuilder('description')}
        </span>
        <textarea
          value={draft.description}
          onChange={(e) => onChangeAction({ description: e.target.value })}
          rows={2}
          className={fieldClassName}
          placeholder={tBuilder('descriptionPlaceholder')}
        />
      </label>
      <div>
        <span className="mb-1 block text-xs font-medium text-gray-600">
          {tBuilder('workflowType')}
        </span>
        <BuilderSelect
          aria-label={tBuilder('workflowType')}
          value={draft.type}
          options={WORKFLOW_TYPES.map((type) => ({
            value: type,
            label: translateType(type),
          }))}
          onChangeAction={(next) => onChangeAction({ type: next as WorkflowType })}
        />
      </div>
      <div>
        <span className="mb-1 block text-xs font-medium text-gray-600">{tBuilder('status')}</span>
        <BuilderSelect
          aria-label={tBuilder('status')}
          value={draft.status}
          options={(['draft', 'active', 'paused'] as WorkflowStatus[]).map((status) => ({
            value: status,
            label: translateStatus(status),
          }))}
          onChangeAction={(next) => onChangeAction({ status: next as WorkflowStatus })}
        />
      </div>
      {formError && <p className="text-xs text-red-500">{formError}</p>}
    </PanelCard>
  );
}

/** Right panel: selected step / action / trigger / condition config */
export function StepDetailsPanel({
  draft,
  selectedNodeId,
  onUpdateNodeAction,
  onDeleteNodeAction,
  onDisconnectNodeAction,
}: {
  draft: WorkflowDraft;
  selectedNodeId: string | null;
  onUpdateNodeAction: (nodeId: string, dataPatch: Partial<WorkflowFlowNode['data']>) => void;
  onDeleteNodeAction?: (nodeId: string) => void;
  onDisconnectNodeAction?: (nodeId: string) => void;
}) {
  const { tBuilder, tFields, translateTrigger, translateAction } = useAutomationTranslations();
  const selected = draft.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const triggers = getTriggersForType(draft.type);
  const actions = getActionsForType(draft.type);

  const stepTitle = selected
    ? selected.data.kind === 'trigger'
      ? tBuilder('nodeTrigger')
      : selected.data.kind === 'agent'
        ? tBuilder('nodeAgent')
        : selected.data.kind === 'app'
          ? tBuilder('nodeApp')
          : selected.data.kind === 'condition'
            ? tBuilder('nodeCondition')
            : tBuilder('nodeAction')
    : tBuilder('stepDetailsTitle');

  return (
    <PanelCard title={stepTitle} hint={tBuilder('stepDetailsHint')}>
      {!selected ? (
        <p className="text-xs text-gray-500">{tBuilder('selectNodeHint')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-end gap-1">
            {onDisconnectNodeAction && (
              <button
                type="button"
                onClick={() => onDisconnectNodeAction(selected.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-[#e6e6e6] px-2 py-1 text-[11px] font-medium text-black hover:bg-gray-50"
                title={tBuilder('disconnectNode')}
              >
                <Unplug className="h-3 w-3" />
                {tBuilder('disconnectNode')}
              </button>
            )}
            {onDeleteNodeAction && (
              <button
                type="button"
                onClick={() => onDeleteNodeAction(selected.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
                title={tBuilder('deleteNode')}
              >
                <Trash2 className="h-3 w-3" />
                {tBuilder('deleteNode')}
              </button>
            )}
          </div>

          {selected.data.kind === 'trigger' && (
            <>
              <div>
                <span className="mb-1 block text-xs font-medium text-gray-600">
                  {tBuilder('triggerType')}
                </span>
                <BuilderSelect
                  aria-label={tBuilder('triggerType')}
                  value={selected.data.catalogType}
                  options={triggers.map((t) => ({
                    value: t.type,
                    label: translateTrigger(t.type),
                  }))}
                  onChangeAction={(next) =>
                    onUpdateNodeAction(selected.id, {
                      catalogType: next,
                      subtitle: translateTrigger(next),
                      config: {},
                    })
                  }
                />
              </div>
              {triggers
                .find((t) => t.type === selected.data.catalogType)
                ?.fields.map((field) => (
                  <label key={field.key} className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600">
                      {tFields.has(field.key) ? tFields(field.key) : field.key}
                    </span>
                    <input
                      type={field.kind === 'number' ? 'number' : 'text'}
                      value={String(selected.data.config?.[field.key] ?? '')}
                      onChange={(e) =>
                        onUpdateNodeAction(selected.id, {
                          config: {
                            ...selected.data.config,
                            [field.key]:
                              field.kind === 'number' ? Number(e.target.value) : e.target.value,
                          },
                        })
                      }
                      className={fieldClassName}
                    />
                  </label>
                ))}
            </>
          )}

          {selected.data.kind === 'agent' && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">
                {tBuilder('agentNote')}
              </span>
              <textarea
                value={String(selected.data.config?.note ?? '')}
                onChange={(e) =>
                  onUpdateNodeAction(selected.id, {
                    config: { ...selected.data.config, note: e.target.value },
                  })
                }
                rows={3}
                className={fieldClassName}
                placeholder={tBuilder('agentNotePlaceholder')}
              />
              <p className="mt-2 text-xs text-gray-500">{tBuilder('agentHint')}</p>
            </label>
          )}

          {selected.data.kind === 'action' && (
            <>
              <div>
                <span className="mb-1 block text-xs font-medium text-gray-600">
                  {tBuilder('actionType')}
                </span>
                <BuilderSelect
                  aria-label={tBuilder('actionType')}
                  value={selected.data.catalogType}
                  options={actions.map((a) => ({
                    value: a.type,
                    label: translateAction(a.type),
                  }))}
                  onChangeAction={(next) =>
                    onUpdateNodeAction(selected.id, {
                      catalogType: next,
                      subtitle: translateAction(next),
                      config: next === 'notify_dashboard' ? { message: '' } : {},
                    })
                  }
                />
              </div>
              {actions
                .find((a) => a.type === selected.data.catalogType)
                ?.fields.map((field) => (
                  <label key={field.key} className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600">
                      {tFields.has(field.key) ? tFields(field.key) : field.key}
                    </span>
                    <input
                      type={field.kind === 'number' ? 'number' : 'text'}
                      value={String(selected.data.config?.[field.key] ?? '')}
                      onChange={(e) =>
                        onUpdateNodeAction(selected.id, {
                          config: {
                            ...selected.data.config,
                            [field.key]:
                              field.kind === 'number' ? Number(e.target.value) : e.target.value,
                          },
                        })
                      }
                      className={fieldClassName}
                    />
                  </label>
                ))}
            </>
          )}

          {selected.data.kind === 'condition' && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">
                  {tBuilder('conditionExpression')}
                </span>
                <textarea
                  value={String(selected.data.config?.expression ?? '')}
                  onChange={(e) =>
                    onUpdateNodeAction(selected.id, {
                      config: { ...selected.data.config, expression: e.target.value },
                      subtitle: e.target.value.trim() || tBuilder('conditionSubtitle'),
                    })
                  }
                  rows={2}
                  className={fieldClassName}
                  placeholder={tBuilder('conditionExpressionPlaceholder')}
                />
              </label>
              <p className="text-xs text-gray-500">{tBuilder('conditionHint')}</p>
            </>
          )}

          {selected.data.kind === 'app' && (
            <>
              {selected.data.catalogType === 'app_webhook' && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">
                    {tBuilder('appWebhookUrl')}
                  </span>
                  <input
                    value={String(selected.data.config?.url ?? '')}
                    onChange={(e) =>
                      onUpdateNodeAction(selected.id, {
                        config: { ...selected.data.config, url: e.target.value },
                      })
                    }
                    className={fieldClassName}
                    placeholder="https://"
                  />
                </label>
              )}
              {selected.data.catalogType === 'app_email' && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">
                    {tBuilder('appEmailTo')}
                  </span>
                  <input
                    value={String(selected.data.config?.to ?? '')}
                    onChange={(e) =>
                      onUpdateNodeAction(selected.id, {
                        config: { ...selected.data.config, to: e.target.value },
                      })
                    }
                    className={fieldClassName}
                    placeholder="ops@company.com"
                  />
                </label>
              )}
              <p className="text-xs text-gray-500">{tBuilder('appHint')}</p>
            </>
          )}
        </>
      )}
    </PanelCard>
  );
}
