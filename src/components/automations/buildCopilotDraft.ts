import type { WorkflowType } from './automationTypes';
import { createLegacyFlatCanvas } from './builder/canvasUtils';
import {
  BRANCH_NO,
  BRANCH_YES,
  DEFAULT_EDGE_TYPE,
  newNodeId,
  type WorkflowFlowEdge,
  type WorkflowFlowNode,
} from './builder/canvasTypes';
import { copilotRecipeById, type CopilotWorkflowRecipe } from '@/lib/automations/copilotRecipes';
import { defaultLakuAgentConfig } from '@/lib/automations/agentModels';
import { defaultConfigForFields, getAllActions, getAllTriggers } from '@/lib/automations/catalog';
import { validateWorkflowPlan, workflowTypeForTrigger, type WorkflowFieldUpdate, type WorkflowPlanStep } from '@/lib/lakuAi/workflowPlan';

export type CopilotBuiltDraft = {
  name: string;
  description: string;
  type: WorkflowType;
  nodes: WorkflowFlowNode[];
  edges: WorkflowFlowEdge[];
};

type CanvasLabels = {
  triggerTitle: string;
  triggerSubtitle: string;
  agentTitle: string;
  agentSubtitle: string;
  actionTitle: string;
  actionSubtitle: string;
};

/** Local canvas only. Callers save later from the canvas. */
export function buildCopilotDraft(input: {
  recipe: CopilotWorkflowRecipe;
  locale: string;
  labels: CanvasLabels;
  triggerLabel: string;
  actionLabels: string[];
  note: string;
  name: string;
  description: string;
  messageTemplate?: string;
}): CopilotBuiltDraft {
  const { recipe } = input;
  const canvasLabels = {
    ...input.labels,
    triggerSubtitle: input.triggerLabel || input.labels.triggerSubtitle,
    actionSubtitle: input.actionLabels[0] || input.labels.actionSubtitle,
  };
  const actions = recipe.actions.map((action) => {
    const config = { ...action.config };
    if (action.type === 'cs_24h_window') {
      config.csReplyLanguage = input.locale === 'id' ? 'id' : 'en';
    }
    if (input.messageTemplate && 'messageTemplate' in config) {
      config.messageTemplate = input.messageTemplate;
    }
    return { ...action, config };
  });
  const canvas = createLegacyFlatCanvas(recipe.workflowType, canvasLabels, {
    triggerType: recipe.triggerType,
    triggerConfig: recipe.triggerConfig,
    actionType: actions[0]?.type,
    actionConfig: actions[0]?.config,
    agentNote: input.note,
  });
  if (recipe.id !== 'buyer_question' && recipe.id !== 'sales_job_assign') {
    const linked = dropAgentNode(canvas);
    canvas.nodes = linked.nodes;
    canvas.edges = linked.edges;
  }
  if (recipe.id === 'sales_job_assign') {
    const agent = canvas.nodes.find((node) => node.data.kind === 'agent');
    const action = canvas.nodes.find((node) => node.data.kind === 'action');
    if (agent && action) {
      const appId = newNodeId('app');
      const appNode: WorkflowFlowNode = {
        id: appId,
        type: 'workflow',
        position: { x: 280, y: 360 },
        data: {
          kind: 'app',
          catalogType: 'app_webhook',
          name: '',
          title: 'WhatsApp',
          subtitle: input.locale === 'id' ? 'Aplikasi' : 'App',
          config: { connected: false, phone: '' },
        },
      };
      canvas.edges = canvas.edges.filter((edge) => !(edge.source === agent.id && edge.target === action.id));
      canvas.edges.push(
        {
          id: `e_${agent.id}_${appId}`,
          source: agent.id,
          target: appId,
          sourceHandle: 'source-bottom',
          targetHandle: 'source-top',
          type: DEFAULT_EDGE_TYPE,
          animated: true,
        },
        {
          id: `e_${appId}_${action.id}`,
          source: appId,
          target: action.id,
          sourceHandle: 'source-bottom',
          targetHandle: 'source-top',
          type: DEFAULT_EDGE_TYPE,
          animated: true,
        },
      );
      const trigger = canvas.nodes.find((node) => node.data.kind === 'trigger');
      canvas.nodes = [trigger, agent, appNode, action].filter((node): node is WorkflowFlowNode => Boolean(node));
      canvas.nodes.forEach((node, index) => {
        node.position = { x: 280, y: 40 + index * 160 };
      });
    }
  }
  if (actions.length > 1) {
    const previous = canvas.nodes[canvas.nodes.length - 1];
    const actionId = newNodeId('action');
    const extra = actions[1];
    canvas.nodes.push({
      id: actionId,
      type: 'workflow',
      position: { x: 280, y: 40 + canvas.nodes.length * 160 },
      data: {
        kind: 'action',
        catalogType: extra.type,
        name: '',
        title: input.actionLabels[1] || canvasLabels.actionTitle,
        subtitle: canvasLabels.actionSubtitle,
        config: extra.config,
      },
    });
    canvas.edges.push({
      id: `e_${previous.id}_${actionId}`,
      source: previous.id,
      target: actionId,
      sourceHandle: 'source-bottom',
      targetHandle: 'source-top',
      type: DEFAULT_EDGE_TYPE,
      animated: true,
    });
  }
  return {
    name: input.name,
    description: input.description,
    type: recipe.workflowType,
    nodes: canvas.nodes,
    edges: canvas.edges,
  };
}

/** Local canvas draft for a catalog recipe. Returns null when the id is not a workflow. */
export function buildCopilotDraftFromRecipe(input: {
  recipeId: string;
  locale: string;
  labels: CanvasLabels;
  text: (key: string) => string;
  has: (key: string) => boolean;
  triggerLabel: (type: string) => string;
  hasTrigger: (type: string) => boolean;
  actionLabel: (type: string) => string;
  hasAction: (type: string) => boolean;
}): CopilotBuiltDraft | null {
  const recipe = copilotRecipeById(input.recipeId);
  if (!recipe || recipe.kind !== 'workflow') return null;
  const templateKey = `recipes.${recipe.id}.template`;
  return buildCopilotDraft({
    recipe,
    locale: input.locale,
    labels: input.labels,
    triggerLabel: input.hasTrigger(recipe.triggerType) ? input.triggerLabel(recipe.triggerType) : input.labels.triggerSubtitle,
    actionLabels: recipe.actions.map((action) =>
      input.hasAction(action.type) ? input.actionLabel(action.type) : input.labels.actionTitle,
    ),
    note: input.text(`recipes.${recipe.id}.logic`),
    name: input.text(`recipes.${recipe.id}.name`),
    description: input.text(`recipes.${recipe.id}.summary`),
    messageTemplate: input.has(templateKey) ? input.text(templateKey) : undefined,
  });
}

function dropAgentNode(canvas: { nodes: WorkflowFlowNode[]; edges: WorkflowFlowEdge[] }): {
  nodes: WorkflowFlowNode[];
  edges: WorkflowFlowEdge[];
} {
  const agent = canvas.nodes.find((node) => node.data.kind === 'agent');
  if (!agent) return canvas;
  const incoming = canvas.edges.find((edge) => edge.target === agent.id);
  const outgoing = canvas.edges.find((edge) => edge.source === agent.id);
  const nodes = canvas.nodes.filter((node) => node.id !== agent.id);
  const edges = canvas.edges.filter((edge) => edge.source !== agent.id && edge.target !== agent.id);
  if (incoming && outgoing) {
    edges.push({
      id: `e_${incoming.source}_${outgoing.target}`,
      source: incoming.source,
      target: outgoing.target,
      sourceHandle: 'source-bottom',
      targetHandle: 'source-top',
      type: DEFAULT_EDGE_TYPE,
      animated: true,
    });
  }
  nodes.forEach((node, index) => {
    node.position = { x: 280, y: 40 + index * 160 };
  });
  return { nodes, edges };
}

/** Local canvas from the steps the assistant was allowed to use. */
export function buildCopilotDraftFromPlan(input: {
  steps: WorkflowPlanStep[];
  locale: string;
  labels: CanvasLabels;
  triggerLabel: (type: string) => string;
  hasTrigger: (type: string) => boolean;
  actionLabel: (type: string) => string;
  hasAction: (type: string) => boolean;
  appTitle: (type: string) => string;
  appSubtitle: string;
  conditionTitle: string;
  endTitle: (type: string) => string;
  endSubtitle: string;
  name: string;
  description: string;
}): CopilotBuiltDraft | null {
  const steps = validateWorkflowPlan(input.steps);
  if (!steps) return null;
  const trigger = steps.find((step) => step.kind === 'trigger');
  if (!trigger || trigger.kind !== 'trigger') return null;
  const nodes: WorkflowFlowNode[] = [];
  const edges: WorkflowFlowEdge[] = [];
  let trunk: WorkflowFlowNode | null = null;
  let row = 0;
  const place = (step: WorkflowPlanStep, x: number, y: number): WorkflowFlowNode => {
    const node: WorkflowFlowNode = {
      id: newNodeId(step.kind === 'agent' ? 'agent' : step.kind),
      type: 'workflow',
      position: { x, y },
      data: planNodeData(step, input),
    };
    nodes.push(node);
    return node;
  };
  const link = (source: WorkflowFlowNode, target: WorkflowFlowNode, label?: string) => {
    edges.push({
      id: `e_${source.id}_${target.id}${label ? `_${label}` : ''}`,
      source: source.id,
      target: target.id,
      sourceHandle: 'source-bottom',
      targetHandle: 'source-top',
      label,
      type: DEFAULT_EDGE_TYPE,
      animated: true,
    });
  };
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    const yes = steps[index + 1];
    const no = steps[index + 2];
    const y = 40 + row * 160;
    if (step.kind === 'condition' && yes && no) {
      const condition = place(step, 280, y);
      if (trunk) link(trunk, condition);
      const yesNode = place(yes, 80, y + 160);
      const noNode = place(no, 440, y + 160);
      link(condition, yesNode, BRANCH_YES);
      link(condition, noNode, BRANCH_NO);
      trunk = null;
      index += 2;
      row += 2;
      continue;
    }
    const node = place(step, 280, y);
    if (trunk) link(trunk, node);
    trunk = node;
    row += 1;
  }
  return {
    name: input.name,
    description: input.description,
    type: workflowTypeForTrigger(trigger.type),
    nodes,
    edges,
  };
}

function mergePlanConfig(
  base: Record<string, unknown>,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  if (!extra) return base;
  const next = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (key === 'buyers' || key === 'products') continue;
    if (value == null || value === '') continue;
    next[key] = value;
  }
  return next;
}

/** Writes filled inputs onto the matching steps without rebuilding the graph. */
export function applyFieldUpdates(nodes: WorkflowFlowNode[], updates: WorkflowFieldUpdate[]): WorkflowFlowNode[] {
  if (!updates.length) return nodes;
  return nodes.map((node) => {
    const matched = updates.filter((item) => item.type === node.data.catalogType);
    if (!matched.length) return node;
    const config = { ...(node.data.config ?? {}) };
    for (const item of matched) Object.assign(config, item.config);
    return { ...node, data: { ...node.data, config } };
  });
}

function planNodeData(
  step: WorkflowPlanStep,
  input: {
    locale: string;
    labels: CanvasLabels;
    triggerLabel: (type: string) => string;
    hasTrigger: (type: string) => boolean;
    actionLabel: (type: string) => string;
    hasAction: (type: string) => boolean;
    appTitle: (type: string) => string;
    appSubtitle: string;
    conditionTitle: string;
    endTitle: (type: string) => string;
    endSubtitle: string;
  },
): WorkflowFlowNode['data'] {
  if (step.kind === 'trigger') {
    const fields = getAllTriggers().find((item) => item.type === step.type)?.fields ?? [];
    const config = defaultConfigForFields(fields);
    if (step.type === 'order_paid') config.paidWhen = 'proof_submitted';
    if (step.type === 'cart_idle' && !config.hours) config.hours = 24;
    Object.assign(config, mergePlanConfig({}, step.config));
    const title = input.hasTrigger(step.type) ? input.triggerLabel(step.type) : input.labels.triggerSubtitle;
    return {
      kind: 'trigger',
      catalogType: step.type,
      name: '',
      title,
      subtitle: input.labels.triggerTitle,
      config,
    };
  }
  if (step.kind === 'action') {
    const fields = getAllActions().find((item) => item.type === step.type)?.fields ?? [];
    const config = defaultConfigForFields(fields);
    if (step.type === 'cs_24h_window') config.csReplyLanguage = input.locale === 'id' ? 'id' : 'en';
    Object.assign(config, mergePlanConfig({}, step.config));
    const title = input.hasAction(step.type) ? input.actionLabel(step.type) : input.labels.actionSubtitle;
    return {
      kind: 'action',
      catalogType: step.type,
      name: '',
      title,
      subtitle: input.labels.actionTitle,
      config,
    };
  }
  if (step.kind === 'agent') {
    return {
      kind: 'agent',
      catalogType: 'laku_agent',
      name: '',
      title: input.labels.agentTitle,
      subtitle: input.labels.agentSubtitle,
      config: defaultLakuAgentConfig(''),
    };
  }
  if (step.kind === 'app') {
    return {
      kind: 'app',
      catalogType: step.type,
      name: '',
      title: input.appTitle(step.type),
      subtitle: input.appSubtitle,
      config: step.type === 'app_email' ? { connected: false, email: '' } : { connected: false, phone: '' },
    };
  }
  if (step.kind === 'condition') {
    return {
      kind: 'condition',
      catalogType: step.type,
      name: '',
      title: input.conditionTitle,
      subtitle: input.conditionTitle,
      config: { rule: 'ai_handoff_requested' },
    };
  }
  return {
    kind: 'end',
    catalogType: step.type,
    name: '',
    title: input.endTitle(step.type),
    subtitle: input.endSubtitle,
    config: {},
  };
}
