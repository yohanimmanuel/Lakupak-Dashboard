import { prisma } from '@/lib/db';
import { dispatchJobToWhatsApp, salesJobTypeLabel } from '@/lib/salesJobs/whatsapp';

function fillSalesJobTemplate(
  template: string,
  facts: { store: string; job: string; salesman: string; reason: string; products: string },
): string {
  return template
    .replace(/\{store\}/gi, facts.store)
    .replace(/\{job\}/gi, facts.job)
    .replace(/\{salesman\}/gi, facts.salesman)
    .replace(/\{reason\}/gi, facts.reason)
    .replace(/\{products\}/gi, facts.products)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Sends the new job to the salesman already assigned on it. */
export async function executeAssignSalesJob(args: {
  userId: number;
  jobId: string;
  messageTemplate: string;
}): Promise<string> {
  const job = await prisma.salesJob.findFirst({
    where: { id: args.jobId, distributorId: args.userId },
    include: {
      agent: { select: { name: true, phone: true, status: true } },
      client: { select: { storeName: true, owner: true } },
    },
  });
  if (!job) throw new Error('Sales job not found');
  if (job.whatsappMessageId) return `Sales job for ${job.agent.name} was already sent on WhatsApp.`;
  const agentNote =
    job.agent.status !== 'active'
      ? 'Sales rep is inactive'
      : !job.agent.phone.trim()
        ? 'Sales rep has no WhatsApp number'
        : null;
  if (agentNote) {
    await prisma.salesJob.update({
      where: { id: job.id },
      data: { dispatchNote: agentNote },
    });
    throw new Error(agentNote);
  }

  const products = job.suggestedProducts.length
    ? await prisma.product.findMany({
        where: { userId: args.userId, productId: { in: job.suggestedProducts } },
        select: { productId: true, name: true },
      })
    : [];
  const productNames = job.suggestedProducts.map(
    (id) => products.find((product) => product.productId === id)?.name || id,
  );
  const store = job.client?.storeName || job.client?.owner || '';
  const template = args.messageTemplate.trim();
  const body = template
    ? fillSalesJobTemplate(template, {
        store,
        job: salesJobTypeLabel(job.jobType),
        salesman: job.agent.name,
        reason: job.priorityReason?.trim() || '',
        products: productNames.join(', '),
      })
    : undefined;
  const sent = await dispatchJobToWhatsApp({
    id: job.id,
    jobType: job.jobType,
    priorityReason: job.priorityReason,
    clientName: store,
    suggestedProductNames: productNames,
    agentPhone: job.agent.phone,
    body,
  });
  await prisma.salesJob.update({
    where: { id: job.id },
    data: {
      ...(job.status === 'pending' || job.status === 'approved' || job.status === 'suggested'
        ? { status: 'dispatched', dispatchedAt: new Date() }
        : {}),
      whatsappMessageId: sent.messageId,
      dispatchNote: null,
    },
  });
  return `Assigned the sales job to ${job.agent.name} and sent the WhatsApp message.`;
}
