import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { broadcastDashboardNotification } from '@/utils/websocketBroadcast';
import crypto from 'crypto';
import { CommissionInvoiceStatus, Prisma } from '@prisma/client';
import { buildRawAttachmentUrl, deleteDocument, uploadDocumentBuffer } from '@/lib/cloudinary';
import { auditAdmin } from '@/lib/audit';

const ALLOWED_STATUSES = new Set(['PENDING', 'PAID', 'OVERDUE', 'VOID']);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeBillingMonth(v: string | null): Date | null {
  if (!v) return null;
  const trimmed = v.trim();
  const monthOnly = /^\d{4}-\d{2}$/.test(trimmed) ? `${trimmed}-01T00:00:00.000Z` : trimmed;
  const d = new Date(monthOnly);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function parseAmount(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function validateMagicBytes(buffer: Buffer, declaredMimeType: string): boolean {
  if (buffer.length < 8) return false;
  if (declaredMimeType === 'application/pdf') {
    return (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d
    );
  }
  if (declaredMimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  }
  return false;
}

function monthLabelUTC(d: Date): string {
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ] as const;
  return `${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function sanitizeFileComponent(s: string): string {
  const t = String(s ?? '').trim();
  if (!t) return 'Company';
  const cleaned = t.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 80) || 'Company';
}

function buildDownloadName(opts: { billingMonth: Date; companyName: string; ext: string }): string {
  const m = monthLabelUTC(opts.billingMonth);
  const c = sanitizeFileComponent(opts.companyName);
  return `${m} Invoice for ${c}.${opts.ext}`;
}

async function saveCommissionInvoiceDocumentWithName(
  fileLike: File | Blob,
  downloadName: string
): Promise<{ url: string; publicId: string; downloadUrl: string }> {
  const mimeType = String(fileLike.type ?? '').trim().toLowerCase();
  if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error('Only PDF or DOCX files are allowed.');
  }
  const buffer = Buffer.from(await fileLike.arrayBuffer());
  if (!validateMagicBytes(buffer, mimeType)) {
    throw new Error('Invalid file signature (file content does not match type).');
  }

  const upload = await uploadDocumentBuffer({
    buffer,
    mimeType,
    folder: 'commission-invoices',
    publicId: `commission-invoices/${crypto.randomUUID?.() ?? crypto.randomBytes(16).toString('hex')}`,
  });
  if (!upload.success) throw new Error(upload.error);
  const filenameBase = sanitizeFileComponent(downloadName.replace(/\.[a-z0-9]+$/i, ''));
  const format = mimeType === 'application/pdf' ? 'pdf' : 'docx';
  return {
    url: upload.url,
    publicId: upload.publicId,
    downloadUrl: buildRawAttachmentUrl({ publicId: upload.publicId, filenameBase, format }),
  };
}

async function notifyCompanyUsers(params: {
  companyId: number;
  type: string;
  title: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
  actionUrl?: string | null;
}) {
  const users = await prisma.user.findMany({
    where: { companyId: params.companyId },
    select: { id: true },
    take: 50,
  });

  await Promise.all(
    users.map(async (u) => {
      await prisma.notification.create({
        data: {
          userId: u.id,
          type: params.type,
          title: params.title,
          message: params.message,
          metadata: params.metadata ?? {},
          actionUrl: params.actionUrl ?? '/settings',
        },
      });
      await broadcastDashboardNotification(u.id).catch(() => {
        /* best-effort */
      });
    })
  );
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ invoiceId: string }> }) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);
    const { invoiceId } = await ctx.params;
    if (!invoiceId) return NextResponse.json({ error: 'Invalid invoiceId' }, { status: 400, headers });

    const before = await prisma.commissionInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        invoiceNo: true,
        companyId: true,
        status: true,
        billingMonth: true,
        documentUrl: true,
        documentPublicId: true,
        currency: true,
      },
    });
    if (!before) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404, headers });
    }

    const contentType = req.headers.get('content-type') ?? '';
    const data: Prisma.CommissionInvoiceUpdateInput = {};
    let nextStatus: string | null = null;
    let newlyUploadedPublicId: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const status = String(formData.get('status') ?? '').trim().toUpperCase();
      if (status && !ALLOWED_STATUSES.has(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400, headers });
      }
      if (status) {
        data.status = status as CommissionInvoiceStatus;
        nextStatus = status;
      }

      const billingMonth = normalizeBillingMonth(String(formData.get('billingMonth') ?? '').trim() || null);
      if (String(formData.get('billingMonth') ?? '').trim() && !billingMonth) {
        return NextResponse.json({ error: 'Invalid billingMonth' }, { status: 400, headers });
      }
      if (billingMonth) data.billingMonth = billingMonth;

      const amountRaw = String(formData.get('amount') ?? '').trim();
      if (amountRaw) {
        const amt = parseAmount(amountRaw);
        if (amt == null) return NextResponse.json({ error: 'Invalid amount' }, { status: 400, headers });
        data.amount = amt;
      }

      const currency = String(formData.get('currency') ?? '').trim();
      if (currency) data.currency = currency;

      const dueAtRaw = String(formData.get('dueAt') ?? '').trim();
      if (dueAtRaw) {
        const d = new Date(dueAtRaw);
        if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid dueAt' }, { status: 400, headers });
        data.dueAt = d;
      } else if (formData.has('dueAt')) {
        data.dueAt = null;
      }

      if (formData.has('description')) {
        const desc = String(formData.get('description') ?? '').trim();
        data.description = desc ? desc : null;
      }

      const file = formData.get('file');
      const isFileOrBlob =
        file && (file instanceof File || (typeof Blob !== 'undefined' && (file as unknown) instanceof Blob));
      if (isFileOrBlob) {
        const fileLike = file as File | Blob;
        const company = await prisma.company.findUnique({ where: { id: before.companyId }, select: { name: true } });
        const nextBillingMonth: Date = (data.billingMonth as Date) ?? before.billingMonth;
        const mimeType = String(fileLike.type ?? '').trim().toLowerCase();
        const ext = mimeType === 'application/pdf' ? 'pdf' : 'docx';
        const downloadName = buildDownloadName({
          billingMonth: nextBillingMonth,
          companyName: company?.name ?? 'Company',
          ext,
        });
        const saved = await saveCommissionInvoiceDocumentWithName(fileLike, downloadName);
        data.documentUrl = saved.url;
        data.documentPublicId = saved.publicId;
        newlyUploadedPublicId = saved.publicId;
      }
    } else {
      const body: unknown = await req.json().catch(() => null);
      if (!isPlainObject(body)) return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers });
      const status = String((body as { status?: unknown }).status ?? '').trim().toUpperCase();
      if (!ALLOWED_STATUSES.has(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400, headers });
      }
      data.status = status as CommissionInvoiceStatus;
      nextStatus = status;
    }

    let updated: Awaited<ReturnType<typeof prisma.commissionInvoice.update>>;
    try {
      updated = await prisma.commissionInvoice.update({
        where: { id: invoiceId },
        data,
      });
    } catch (e) {
      if (newlyUploadedPublicId) {
        try {
          await deleteDocument(newlyUploadedPublicId);
        } catch (cleanupErr) {
          console.error('Failed to cleanup orphaned Cloudinary document', cleanupErr);
        }
      }
      throw e;
    }

    // If document was replaced, best-effort delete old Cloudinary asset.
    if (data.documentPublicId && before.documentPublicId && before.documentPublicId !== updated.documentPublicId) {
      void deleteDocument(before.documentPublicId).catch(() => {
        /* best-effort */
      });
    }

    if (nextStatus && String(before.status).toUpperCase() !== String(updated.status).toUpperCase()) {
      const month = updated.billingMonth.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
      void notifyCompanyUsers({
        companyId: updated.companyId,
        type: 'billing',
        title: 'Commission invoice status updated',
        message: `Your ${month} commission invoice ${updated.invoiceNo} is now marked as ${String(updated.status).toUpperCase()}.`,
        metadata: { invoiceId: updated.id, invoiceNo: updated.invoiceNo, status: updated.status },
        actionUrl: '/settings',
      });
    }

    auditAdmin(req, {
      action: 'commission_invoice.update',
      resourceType: 'CommissionInvoice',
      resourceId: updated.id,
      actorId: adminId,
      metadata: {
        invoiceNo: updated.invoiceNo,
        companyId: updated.companyId,
        ...(nextStatus ? { fromStatus: before.status, toStatus: updated.status } : {}),
      },
    });

    return NextResponse.json(
      {
        invoice: {
          id: updated.id,
          invoiceNo: updated.invoiceNo,
          companyId: updated.companyId,
          billingMonth: updated.billingMonth.toISOString(),
          amount: updated.amount.toString(),
          currency: updated.currency,
          status: updated.status,
          issuedAt: updated.issuedAt.toISOString(),
          dueAt: updated.dueAt?.toISOString() ?? null,
          description: updated.description ?? null,
          documentUrl: updated.documentUrl,
          downloadUrl: updated.documentPublicId
            ? buildRawAttachmentUrl({
                publicId: updated.documentPublicId,
                filenameBase: updated.invoiceNo,
                format: updated.documentUrl?.toLowerCase().endsWith('.pdf') || 
                        updated.documentPublicId?.toLowerCase().includes('pdf') ? 'pdf' : 'docx',
              })
            : updated.documentUrl,
          createdAt: updated.createdAt.toISOString(),
        },
      },
      { status: 200, headers }
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    console.error('PATCH /api/platform-admin/commission-invoices/[invoiceId]', err);
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500, headers });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ invoiceId: string }> }) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);
    const { invoiceId } = await ctx.params;
    if (!invoiceId) return NextResponse.json({ error: 'Invalid invoiceId' }, { status: 400, headers });

    const inv = await prisma.commissionInvoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, invoiceNo: true, companyId: true, documentUrl: true, documentPublicId: true },
    });
    if (!inv) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404, headers });
    }

    await prisma.commissionInvoice.delete({ where: { id: invoiceId } });

    // Best-effort: delete Cloudinary asset (raw) if present.
    if (inv.documentPublicId) {
      void deleteDocument(inv.documentPublicId).catch(() => {
        /* best-effort */
      });
    }

    // Notify company users to refresh (so UI badge/list updates quickly)
    void notifyCompanyUsers({
      companyId: inv.companyId,
      type: 'billing',
      title: 'Commission invoice removed',
      message: `Commission invoice ${inv.invoiceNo} has been removed by an admin.`,
      metadata: { invoiceId: inv.id, invoiceNo: inv.invoiceNo, removed: true },
      actionUrl: '/settings',
    });

    auditAdmin(req, {
      action: 'commission_invoice.delete',
      resourceType: 'CommissionInvoice',
      resourceId: inv.id,
      actorId: adminId,
      metadata: { invoiceNo: inv.invoiceNo, companyId: inv.companyId },
    });

    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    console.error('DELETE /api/platform-admin/commission-invoices/[invoiceId]', err);
    return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500, headers });
  }
}

