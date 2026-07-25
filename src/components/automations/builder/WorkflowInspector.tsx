'use client';

import React from 'react';
import { Lightbulb, Trash2, Unplug, X } from 'lucide-react';
import type { AutomationRun, WorkflowStatus, WorkflowType } from '../automationTypes';
import { WORKFLOW_TYPES } from '../automationTypes';
import { getActionsForType, getTriggersForType, defaultConfigForFields } from '@/lib/automations/catalog';
import type { CatalogField } from '@/lib/automations/catalog';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import { BuilderSelect } from './BuilderSelect';
import type { WorkflowFlowEdge, WorkflowFlowNode } from './canvasTypes';
import { WorkflowRunsPanel } from './WorkflowRunsPanel';
import { useBuilderPanelControls } from './WorkflowBuilderShell';

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

function CatalogFieldInput({
  field,
  value,
  onChange,
  label,
  optionLabel,
}: {
  field: CatalogField;
  value: unknown;
  onChange: (next: string | number) => void;
  label: string;
  optionLabel: (option: string) => string;
}) {
  const selectFallback = field.kind === 'select' ? (field.options?.[0] ?? '') : '';
  const selectValueMissing =
    field.kind === 'select' &&
    (value === undefined || value === null || String(value) === '');

  // Display already falls back to options[0]; persist that once so saves/export see it.
  React.useEffect(() => {
    if (!selectValueMissing || !selectFallback) return;
    onChange(selectFallback);
  }, [selectValueMissing, selectFallback, onChange]);

  if (field.kind === 'select') {
    return (
      <div>
        <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
        <BuilderSelect
          aria-label={label}
          value={String(value ?? selectFallback)}
          options={(field.options ?? []).map((option) => ({
            value: option,
            label: optionLabel(option),
          }))}
          onChangeAction={(next) => onChange(next)}
        />
      </div>
    );
  }

  if (field.kind === 'textarea') {
    return (
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={fieldClassName}
        />
      </label>
    );
  }

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <input
        type={field.kind === 'number' ? 'number' : 'text'}
        value={String(value ?? '')}
        onChange={(e) => {
          if (field.kind !== 'number') return onChange(e.target.value);
          const raw = e.target.value;
          if (raw === '') return onChange('');
          const parsed = Number(raw);
          if (!Number.isNaN(parsed)) onChange(parsed);
        }}
        className={fieldClassName}
      />
    </label>
  );
}

function PanelCard({
  title,
  hint,
  children,
  onClose,
  closeLabel,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <section className="min-h-0 max-h-full flex-1 overflow-y-auto rounded-xl border border-[#e6e6e6] bg-white/95 backdrop-blur-sm">
      <div className="sticky top-0 z-10 flex items-start gap-2 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur-sm">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-black">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 shrink-0 rounded-lg p-1 text-gray-500 hover:bg-gray-50 hover:text-black"
            aria-label={closeLabel}
            title={closeLabel}
          >
            <X className="h-4 w-4" />
          </button>
        )}
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
  const panelControls = useBuilderPanelControls();

  return (
    <PanelCard
      title={tBuilder('workflowDetailsTitle')}
      hint={tBuilder('workflowDetailsHint')}
      onClose={panelControls?.closeWorkflowDetails}
      closeLabel={tBuilder('collapseWorkflowDetails')}
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

/** Right panel: selected step config + run history in one section */
export function StepDetailsPanel({
  draft,
  selectedNodeId,
  onUpdateNodeAction,
  onDeleteNodeAction,
  onDisconnectNodeAction,
  onCloseAction,
  runs,
}: {
  draft: WorkflowDraft;
  selectedNodeId: string | null;
  onUpdateNodeAction: (nodeId: string, dataPatch: Partial<WorkflowFlowNode['data']>) => void;
  onDeleteNodeAction?: (nodeId: string) => void;
  onDisconnectNodeAction?: (nodeId: string) => void;
  onCloseAction?: () => void;
  runs?: AutomationRun[];
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

  const elementDescription = (() => {
    if (!selected) return null;
    if (selected.data.kind === 'trigger') {
      const key = `triggerHints.${selected.data.catalogType}`;
      return tBuilder.has(key) ? tBuilder(key) : null;
    }
    if (selected.data.kind === 'action') {
      const key = `actionHints.${selected.data.catalogType}`;
      return tBuilder.has(key) ? tBuilder(key) : null;
    }
    if (selected.data.kind === 'agent') return tBuilder('agentHint');
    if (selected.data.kind === 'condition') return tBuilder('conditionHint');
    if (selected.data.kind === 'app') {
      return selected.data.catalogType === 'app_email'
        ? tBuilder('appEmailHint')
        : tBuilder('appWebhookHint');
    }
    return null;
  })();

  return (
    <PanelCard
      title={stepTitle}
      hint={tBuilder('stepDetailsHint')}
      onClose={onCloseAction}
      closeLabel={tBuilder('collapseStepDetails')}
    >
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

          {elementDescription && (
            <div className="flex items-start gap-2 rounded-lg bg-[#f7faff] px-3 py-2">
              <Lightbulb
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                aria-hidden
              />
              <p className="text-xs leading-relaxed text-gray-600">{elementDescription}</p>
            </div>
          )}

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
                  onChangeAction={(next) => {
                    const def = triggers.find((t) => t.type === next);
                    onUpdateNodeAction(selected.id, {
                      catalogType: next,
                      config: defaultConfigForFields(def?.fields ?? []),
                    });
                  }}
                />
              </div>
              {triggers
                .find((t) => t.type === selected.data.catalogType)
                ?.fields.map((field) => (
                  <CatalogFieldInput
                    key={field.key}
                    field={field}
                    value={selected.data.config?.[field.key]}
                    label={tFields.has(field.key) ? tFields(field.key) : field.key}
                    optionLabel={(option) =>
                      tFields.has(`options.${option}`) ? tFields(`options.${option}`) : option
                    }
                    onChange={(next) =>
                      onUpdateNodeAction(selected.id, {
                        config: {
                          ...selected.data.config,
                          [field.key]: next,
                        },
                      })
                    }
                  />
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
                  onChangeAction={(next) => {
                    const def = actions.find((a) => a.type === next);
                    onUpdateNodeAction(selected.id, {
                      catalogType: next,
                      config: defaultConfigForFields(def?.fields ?? []),
                    });
                  }}
                />
              </div>
              {actions
                .find((a) => a.type === selected.data.catalogType)
                ?.fields.map((field) => (
                  <CatalogFieldInput
                    key={field.key}
                    field={field}
                    value={selected.data.config?.[field.key]}
                    label={tFields.has(field.key) ? tFields(field.key) : field.key}
                    optionLabel={(option) =>
                      tFields.has(`options.${option}`) ? tFields(`options.${option}`) : option
                    }
                    onChange={(next) =>
                      onUpdateNodeAction(selected.id, {
                        config: {
                          ...selected.data.config,
                          [field.key]: next,
                        },
                      })
                    }
                  />
                ))}
            </>
          )}

          {selected.data.kind === 'condition' && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">
                {tBuilder('conditionExpression')}
              </span>
              <textarea
                value={String(selected.data.config?.expression ?? '')}
                onChange={(e) =>
                  onUpdateNodeAction(selected.id, {
                    config: { ...selected.data.config, expression: e.target.value },
                  })
                }
                rows={2}
                className={fieldClassName}
                placeholder={tBuilder('conditionExpressionPlaceholder')}
              />
            </label>
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

      {runs && (
        <div className="-mx-4 border-t border-gray-100 px-4 pt-4">
          <WorkflowRunsPanel runs={runs} />
        </div>
      )}
    </PanelCard>
  );
}
