import { describe, expect, it } from 'vitest';
import { conversationListWhere, conversationTitle } from '@/lib/lakuAi/conversationTitle';

describe('conversation history scope', () => {
  it('keeps general Copilot threads separate from a workflow thread', () => {
    const general = conversationListWhere(4, { kind: 'general' });
    const workflow = conversationListWhere(4, { kind: 'automation', automationId: 'wf_1' });
    expect(general).toEqual({ userId: 4, automationId: null });
    expect(workflow).toEqual({ userId: 4, automationId: 'wf_1' });
    expect(general.automationId).not.toEqual(workflow.automationId);
  });

  it('shortens a long first message and keeps a short one', () => {
    expect(conversationTitle('Review margins')).toBe('Review margins');
    const long = 'Review my products and tell me which ones are low on stock this month please';
    const title = conversationTitle(long);
    expect(title.length).toBeLessThanOrEqual(40);
    expect(title.endsWith('...')).toBe(true);
    expect(title.includes('Review my products')).toBe(true);
  });
});
