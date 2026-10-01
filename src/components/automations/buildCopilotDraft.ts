import type { WorkflowType } from './automationTypes';
import { createLegacyFlatCanvas } from './builder/canvasUtils';
import { DEFAULT_EDGE_TYPE, newNodeId, type WorkflowFlowEdge, type WorkflowFlowNode } from './builder/canvasTypes';
import type { CopilotWorkflowRecipe } from '@/lib/automations/copilotRecipes';

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
  if (actions.length > 1) {
    const previous = canvas.nodes[canvas.nodes.length - 1];
    const actionId = newNodeId('action');
    const extra = actions[1];
    canvas.nodes.push({
      id: actionId,
      type: 'workflow',
      position: { x: 280, y: 520 },
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
