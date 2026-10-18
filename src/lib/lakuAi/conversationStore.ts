import { prisma } from '@/lib/db';
import { packCanvasReply, readCanvasReply } from '@/lib/lakuAi/copilotReviewPlan';
import { conversationListWhere, conversationTitle, type ConversationListScope } from '@/lib/lakuAi/conversationTitle';

export type StoredTurn = {
  role: 'user' | 'assistant';
  content: string;
  recipeId?: string | null;
};

const CONTENT_LIMIT = 20000;

function clipStoredContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= CONTENT_LIMIT) return trimmed;
  const { text, edit, prospectFills } = readCanvasReply(trimmed);
  if (!edit && prospectFills.length === 0) return text.slice(0, CONTENT_LIMIT);
  const markerLength = packCanvasReply('', edit, prospectFills).length;
  if (markerLength > CONTENT_LIMIT) return text.slice(0, CONTENT_LIMIT);
  return packCanvasReply(text.slice(0, CONTENT_LIMIT - markerLength), edit, prospectFills);
}

function cleanTurns(turns: StoredTurn[]): StoredTurn[] {
  return turns
    .map((turn) => ({
      role: turn.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: clipStoredContent(String(turn.content ?? '')),
      recipeId: turn.role === 'assistant' && turn.recipeId ? String(turn.recipeId).slice(0, 80) : null,
    }))
    .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
    .filter((turn) => turn.content.length > 0);
}

async function assertWorkflowOwner(userId: number, automationId: string): Promise<boolean> {
  const workflow = await prisma.automationWorkflow.findFirst({
    where: { id: automationId, userId },
    select: { id: true },
  });
  return Boolean(workflow);
}

export async function listConversations(userId: number, scope: ConversationListScope) {
  return prisma.aiConversation.findMany({
    where: conversationListWhere(userId, scope),
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    select: { id: true, title: true, updatedAt: true, automationId: true, pinned: true },
    take: 100,
  });
}

export async function getConversation(userId: number, id: string) {
  return prisma.aiConversation.findFirst({
    where: { id, userId },
    select: {
      id: true,
      title: true,
      automationId: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, role: true, content: true, recipeId: true, createdAt: true },
      },
    },
  });
}

/** Creates a thread. automationId is written here only, and later calls do not change it. */
export async function createConversation(userId: number, automationId: string | null, turns: StoredTurn[]) {
  const messages = cleanTurns(turns);
  const firstUser = messages.find((turn) => turn.role === 'user');
  if (!firstUser || messages.length === 0 || messages.length > 200) return { error: 'bad_request' as const };
  if (automationId) {
    const owns = await assertWorkflowOwner(userId, automationId);
    if (!owns) return { error: 'not_found' as const };
  }
  const started = Date.now();
  const created = await prisma.aiConversation.create({
    data: {
      userId,
      title: conversationTitle(firstUser.content),
      automationId,
      messages: {
        create: messages.map((turn, index) => ({
          role: turn.role,
          content: turn.content,
          recipeId: turn.recipeId,
          createdAt: new Date(started + index),
        })),
      },
    },
    select: { id: true, title: true, automationId: true, updatedAt: true },
  });
  return { conversation: created };
}

/** Appends one user turn and one assistant turn. Does not read or write automationId. */
export async function appendConversationTurn(
  userId: number,
  conversationId: string,
  userContent: string,
  assistantContent: string,
  recipeId?: string | null,
) {
  const existing = await prisma.aiConversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true },
  });
  if (!existing) return { error: 'not_found' as const };
  const userText = userContent.trim().slice(0, CONTENT_LIMIT);
  const assistantText = clipStoredContent(assistantContent);
  if (!userText || !assistantText) return { error: 'bad_request' as const };
  const started = Date.now();
  const updated = await prisma.aiConversation.update({
    where: { id: conversationId },
    data: {
      updatedAt: new Date(),
      messages: {
        create: [
          { role: 'user', content: userText, createdAt: new Date(started) },
          {
            role: 'assistant',
            content: assistantText,
            recipeId: recipeId ? String(recipeId).slice(0, 80) : null,
            createdAt: new Date(started + 1),
          },
        ],
      },
    },
    select: { id: true, title: true, automationId: true, updatedAt: true },
  });
  return { conversation: updated };
}

/** Pins or unpins a thread the user owns. Does not change automationId or updatedAt. */
export async function setConversationPinned(userId: number, conversationId: string, pinned: boolean) {
  const updated = await prisma.$executeRaw`
    UPDATE "AiConversation"
    SET "pinned" = ${pinned}
    WHERE "id" = ${conversationId} AND "userId" = ${userId}
  `;
  if (updated === 0) return { error: 'not_found' as const };
  const conversation = await prisma.aiConversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true, title: true, automationId: true, updatedAt: true, pinned: true },
  });
  if (!conversation) return { error: 'not_found' as const };
  return { conversation };
}

/** Renames a thread the user owns. Does not change automationId or updatedAt. */
export async function renameConversation(userId: number, conversationId: string, title: string) {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!clean || !conversationId) return { error: 'bad_request' as const };
  const updated = await prisma.$executeRaw`
    UPDATE "AiConversation"
    SET "title" = ${clean}
    WHERE "id" = ${conversationId} AND "userId" = ${userId}
  `;
  if (updated === 0) return { error: 'not_found' as const };
  return { conversation: { id: conversationId, title: clean } };
}

/** Deletes a thread the user owns. Messages go with it. */
export async function deleteConversation(userId: number, conversationId: string) {
  const deleted = await prisma.aiConversation.deleteMany({
    where: { id: conversationId, userId },
  });
  if (deleted.count === 0) return { error: 'not_found' as const };
  return { ok: true as const };
}
