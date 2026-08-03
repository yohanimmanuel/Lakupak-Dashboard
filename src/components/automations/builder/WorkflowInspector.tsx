'use client';

import React from 'react';
import { Lightbulb, Trash2, Unplug, X } from 'lucide-react';
import type { AutomationRun, WorkflowStatus, WorkflowType } from '../automationTypes';
import { WORKFLOW_TYPES } from '../automationTypes';
import { getActionsForInspector, getAllTriggers, defaultConfigForFields } from '@/lib/automations/catalog';
import type { CatalogField } from '@/lib/automations/catalog';
import {
  DEFAULT_LAKU_AGENT_MODEL,
  LAKU_AGENT_MODEL_IDS,
  LAKU_AGENT_MODEL_LOGOS,
  normalizeLakuAgentModelId,
  resolveLakuAgentProviderModel,
} from '@/lib/automations/agentModels';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import { BuilderSelect } from './BuilderSelect';
import type { WorkflowFlowEdge, WorkflowFlowNode } from './canvasTypes';
import { WorkflowRunsPanel } from './WorkflowRunsPanel';
import { useBuilderPanelControls } from './WorkflowBuilderShell';
import { BuyerPickerField, normalizePickedBuyers, toPickedBuyer } from './BuyerPickerField';
import { CampaignPickerField, normalizePickedCampaigns } from './CampaignPickerField';
import { FleetPickerField, normalizePickedFleets } from './FleetPickerField';
import { ProductPickerField, normalizePickedProducts } from './ProductPickerField';
import type { Buyer } from '@/types/client';

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

  if (field.kind === 'datetime') {
    const raw = String(value ?? '');
    // datetime-local needs YYYY-MM-DDTHH:mm; accept ISO strings by trimming seconds/zone.
    const localValue = raw.includes('T')
      ? raw.slice(0, 16)
      : raw;
    return (
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
        <input
          type="datetime-local"
          value={localValue}
          onChange={(e) => onChange(e.target.value)}
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
  onDeleteRunAction,
  onClearAllRunsAction,
  clearingRuns = false,
}: {
  draft: WorkflowDraft;
  selectedNodeId: string | null;
  onUpdateNodeAction: (nodeId: string, dataPatch: Partial<WorkflowFlowNode['data']>) => void;
  onDeleteNodeAction?: (nodeId: string) => void;
  onDisconnectNodeAction?: (nodeId: string) => void;
  onCloseAction?: () => void;
  runs?: AutomationRun[];
  onDeleteRunAction?: (runId: string) => void;
  onClearAllRunsAction?: () => void;
  clearingRuns?: boolean;
}) {
  const { tBuilder, tFields, translateTrigger, translateAction } = useAutomationTranslations();
  const selected = draft.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const triggers = getAllTriggers();
  const actions = getActionsForInspector(
    draft.type,
    selected?.data.kind === 'action' ? selected.data.catalogType : undefined,
  );

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
                ?.fields.map((field) =>
                  field.kind === 'product' ? (
                    <ProductPickerField
                      key={field.key}
                      label={tFields.has(field.key) ? tFields(field.key) : field.key}
                      selectedProducts={normalizePickedProducts(selected.data.config)}
                      requireVariant={selected.data.catalogType === 'stock_below'}
                      onSelectAction={(picked) =>
                        onUpdateNodeAction(selected.id, {
                          config: {
                            ...selected.data.config,
                            selectedProducts: picked,
                            productId: picked[0]?.productId ?? '',
                            productLabel: picked[0]?.productLabel ?? '',
                            variantId: picked[0]?.variantId ?? '',
                            variantLabel: picked[0]?.variantLabel ?? '',
                          },
                        })
                      }
                      onClearAction={() =>
                        onUpdateNodeAction(selected.id, {
                          config: {
                            ...selected.data.config,
                            selectedProducts: [],
                            productId: '',
                            productLabel: '',
                            variantId: '',
                            variantLabel: '',
                          },
                        })
                      }
                    />
                  ) : (
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
                  ),
                )}
            </>
          )}

          {selected.data.kind === 'agent' && (
            <>
              <div>
                <span className="mb-1 block text-xs font-medium text-gray-600">
                  {tBuilder('agentModel')}
                </span>
                <BuilderSelect
                  aria-label={tBuilder('agentModel')}
                  value={normalizeLakuAgentModelId(selected.data.config?.model)}
                  options={LAKU_AGENT_MODEL_IDS.map((id) => ({
                    value: id,
                    label: tBuilder.has(`agentModels.${id}`)
                      ? tBuilder(`agentModels.${id}`)
                      : id,
                    iconSrc: LAKU_AGENT_MODEL_LOGOS[id],
                  }))}
                  onChangeAction={(next) => {
                    const model = normalizeLakuAgentModelId(next || DEFAULT_LAKU_AGENT_MODEL);
                    onUpdateNodeAction(selected.id, {
                      config: {
                        ...selected.data.config,
                        model,
                        providerModel: resolveLakuAgentProviderModel(model),
                      },
                    });
                  }}
                  />
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">
                  {tBuilder('agentNote')}
                </span>
                <textarea
                  value={String(selected.data.config?.note ?? '')}
                  onChange={(e) => {
                    const model = normalizeLakuAgentModelId(selected.data.config?.model);
                    onUpdateNodeAction(selected.id, {
                      config: {
                        ...selected.data.config,
                        note: e.target.value,
                        model,
                        providerModel: resolveLakuAgentProviderModel(model),
                      },
                    });
                  }}
                  rows={3}
                  className={fieldClassName}
                  placeholder={tBuilder('agentNotePlaceholder')}
                />
              </label>
            </>
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
                ?.fields.map((field) =>
                  field.kind === 'buyer' ? (
                    <BuyerPickerField
                      key={field.key}
                      label={tFields.has(field.key) ? tFields(field.key) : field.key}
                      selectedBuyers={normalizePickedBuyers(selected.data.config)}
                      onSelectAction={(buyers: Buyer[]) => {
                        const picked = buyers.map(toPickedBuyer);
                        onUpdateNodeAction(selected.id, {
                          config: {
                            ...selected.data.config,
                            selectedBuyers: picked,
                            buyerId: picked[0]?.buyerId ?? '',
                            buyerLabel: picked[0]?.buyerLabel ?? '',
                            buyerPhone: picked[0]?.buyerPhone ?? '',
                          },
                        });
                      }}
                      onClearAction={() =>
                        onUpdateNodeAction(selected.id, {
                          config: {
                            ...selected.data.config,
                            selectedBuyers: [],
                            buyerId: '',
                            buyerLabel: '',
                            buyerPhone: '',
                          },
                        })
                      }
                    />
                  ) : field.kind === 'fleet' ? (
                    <FleetPickerField
                      key={field.key}
                      label={tFields.has(field.key) ? tFields(field.key) : field.key}
                      selectedFleets={normalizePickedFleets(selected.data.config)}
                      requireDriver={selected.data.catalogType === 'assign_driver'}
                      onSelectAction={(fleets) =>
                        onUpdateNodeAction(selected.id, {
                          config: {
                            ...selected.data.config,
                            selectedFleets: fleets,
                            fleetId: fleets[0]?.fleetId ?? '',
                            fleetLabel: fleets[0]?.fleetLabel ?? '',
                            fleetStatus: fleets[0]?.fleetStatus ?? '',
                            driverId: fleets[0]?.driverId ?? '',
                            driverName: fleets[0]?.driverName ?? '',
                            assignedLogistics: fleets[0]?.assignedLogistics ?? '',
                          },
                        })
                      }
                      onClearAction={() =>
                        onUpdateNodeAction(selected.id, {
                          config: {
                            ...selected.data.config,
                            selectedFleets: [],
                            fleetId: '',
                            fleetLabel: '',
                            fleetStatus: '',
                            driverId: '',
                            driverName: '',
                            assignedLogistics: '',
                          },
                        })
                      }
                    />
                  ) : field.kind === 'product' ? (
                    <ProductPickerField
                      key={field.key}
                      label={tFields.has(field.key) ? tFields(field.key) : field.key}
                      selectedProducts={normalizePickedProducts(selected.data.config)}
                      requireVariant={false}
                      onSelectAction={(picked) =>
                        onUpdateNodeAction(selected.id, {
                          config: {
                            ...selected.data.config,
                            selectedProducts: picked,
                            productId: picked[0]?.productId ?? '',
                            productLabel: picked[0]?.productLabel ?? '',
                            variantId: picked[0]?.variantId ?? '',
                            variantLabel: picked[0]?.variantLabel ?? '',
                          },
                        })
                      }
                      onClearAction={() =>
                        onUpdateNodeAction(selected.id, {
                          config: {
                            ...selected.data.config,
                            selectedProducts: [],
                            productId: '',
                            productLabel: '',
                            variantId: '',
                            variantLabel: '',
                          },
                        })
                      }
                    />
                  ) : field.kind === 'campaign' ? (
                    <CampaignPickerField
                      key={field.key}
                      label={tFields.has(field.key) ? tFields(field.key) : field.key}
                      selectedCampaigns={normalizePickedCampaigns(selected.data.config)}
                      onSelectAction={(picked) =>
                        onUpdateNodeAction(selected.id, {
                          config: {
                            ...selected.data.config,
                            selectedCampaigns: picked,
                            campaignId: picked[0]?.campaignId ?? '',
                            campaignLabel: picked[0]?.campaignLabel ?? '',
                            campaignStatus: picked[0]?.campaignStatus ?? '',
                          },
                        })
                      }
                      onClearAction={() =>
                        onUpdateNodeAction(selected.id, {
                          config: {
                            ...selected.data.config,
                            selectedCampaigns: [],
                            campaignId: '',
                            campaignLabel: '',
                            campaignStatus: '',
                          },
                        })
                      }
                    />
                  ) : (
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
                  ),
                )}
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
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600">
                      {tBuilder('appWhatsAppPhone')}
                    </span>
                    <input
                      type="tel"
                      value={String(selected.data.config?.phone ?? '')}
                      onChange={(e) =>
                        onUpdateNodeAction(selected.id, {
                          config: {
                            ...selected.data.config,
                            phone: e.target.value,
                          },
                        })
                      }
                      className={fieldClassName}
                      placeholder={tBuilder('appWhatsAppPhonePlaceholder')}
                      autoComplete="tel"
                    />
                    <p className="mt-1 text-[11px] leading-snug text-gray-500">
                      {tBuilder('appWhatsAppPhoneHint')}
                    </p>
                  </label>
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-[#e6e6e6] bg-[#fafafa] px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-black">
                        {tBuilder('appWhatsAppAccount')}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {selected.data.config?.connected
                          ? tBuilder('appConnected')
                          : tBuilder('appNotConnected')}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        selected.data.config?.connected
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {selected.data.config?.connected
                        ? tBuilder('appStatusConnected')
                        : tBuilder('appStatusNotConnected')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateNodeAction(selected.id, {
                        config: {
                          ...selected.data.config,
                          connected: !selected.data.config?.connected,
                        },
                      })
                    }
                    className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${
                      selected.data.config?.connected
                        ? 'border border-[#e6e6e6] bg-white text-black hover:bg-gray-50'
                        : 'bg-[#25D366] text-white hover:bg-[#1ebe57]'
                    }`}
                  >
                    {selected.data.config?.connected
                      ? tBuilder('appDisconnectWhatsApp')
                      : tBuilder('appConnectWhatsApp')}
                  </button>
                  <p className="text-[11px] leading-snug text-gray-500">
                    {tBuilder('appWhatsAppConnectHint')}
                  </p>
                </div>
              )}
              {selected.data.catalogType === 'app_email' && (
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600">
                      {tBuilder('appGmailEmail')}
                    </span>
                    <input
                      type="email"
                      value={String(selected.data.config?.email ?? '')}
                      onChange={(e) =>
                        onUpdateNodeAction(selected.id, {
                          config: {
                            ...selected.data.config,
                            email: e.target.value,
                          },
                        })
                      }
                      className={fieldClassName}
                      placeholder={tBuilder('appGmailEmailPlaceholder')}
                      autoComplete="email"
                    />
                    <p className="mt-1 text-[11px] leading-snug text-gray-500">
                      {tBuilder('appGmailEmailHint')}
                    </p>
                  </label>
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-[#e6e6e6] bg-[#fafafa] px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-black">
                        {tBuilder('appGmailAccount')}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {selected.data.config?.connected
                          ? tBuilder('appConnected')
                          : tBuilder('appNotConnected')}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        selected.data.config?.connected
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {selected.data.config?.connected
                        ? tBuilder('appStatusConnected')
                        : tBuilder('appStatusNotConnected')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateNodeAction(selected.id, {
                        config: {
                          ...selected.data.config,
                          connected: !selected.data.config?.connected,
                        },
                      })
                    }
                    className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${
                      selected.data.config?.connected
                        ? 'border border-[#e6e6e6] bg-white text-black hover:bg-gray-50'
                        : 'bg-[#0a61d7] text-white hover:bg-[#084ba6]'
                    }`}
                  >
                    {selected.data.config?.connected
                      ? tBuilder('appDisconnectGmail')
                      : tBuilder('appConnectGmail')}
                  </button>
                  <p className="text-[11px] leading-snug text-gray-500">
                    {tBuilder('appGmailConnectHint')}
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {runs && (
        <div className="-mx-4 border-t border-gray-100 px-4 pt-4">
          <WorkflowRunsPanel
            runs={runs}
            onDeleteRunAction={onDeleteRunAction}
            onClearAllAction={onClearAllRunsAction}
            clearing={clearingRuns}
          />
        </div>
      )}
    </PanelCard>
  );
}
