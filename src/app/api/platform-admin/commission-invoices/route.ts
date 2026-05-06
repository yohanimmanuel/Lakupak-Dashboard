import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import crypto from 'crypto';
import { broadcastDashboardNotification } from '@/utils/websocketBroadcast';
import { Prisma } from '@prisma/client';
import { buildRawAttachmentUrl, uploadDocumentBuffer } from '@/lib/cloudinary';
import path from 'path';

function parsePositiveInt(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n % 1 !== 0 || n < 1) return null;
  return n;
}

function parseAmount(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizeBillingMonth(v: string | null): Date | null {
  if (!v) return null;
  // Accept "YYYY-MM" or ISO date; normalize to first day of month.
  const trimmed = v.trim();
  const monthOnly = /^\d{4}-\d{2}$/.test(trimmed) ? `${trimmed}-01T00:00:00.000Z` : trimmed;
  const d = new Date(monthOnly);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

async function nextInvoiceNo(billingMonth: Date): Promise<string> {
  const y = billingMonth.getUTCFullYear();
  const m = String(billingMonth.getUTCMonth() + 1).padStart(2, '0');
  const prefix = `COM-${y}-${m}-`;

  const last = await prisma.commissionInvoice.findFirst({
    where: { invoiceNo: { startsWith: prefix } },
    // Order by invoiceNo so the highest sequence wins (createdAt can be misleading).
    orderBy: { invoiceNo: 'desc' },
    select: { invoiceNo: true },
  });

  const lastSeq = last?.invoiceNo?.startsWith(prefix) ? Number(last.invoiceNo.slice(prefix.length)) : 0;
  const seq = Number.isFinite(lastSeq) && lastSeq > 0 ? lastSeq + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

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

async function saveCommissionInvoiceDocument(fileLike: File | Blob): Promise<{ url: string; publicId: string }> {
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
  return { url: upload.url, publicId: upload.publicId };
}

function monthLabelUTC(d: Date): string {
  // Ensure "May 2026" style label, stable regardless of server locale.
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
  // Remove characters not safe for Windows file names.
  const cleaned = t.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 80) || 'Company';
}

function buildDownloadName(opts: { billingMonth: Date; companyName: string; ext: string }): string {
  const m = monthLabelUTC(opts.billingMonth);
  const c = sanitizeFileComponent(opts.companyName);
  return `${m} Invoice for ${c}.${opts.ext}`;
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

  const format = mimeType === 'application/pdf' ? 'pdf' : 'docx';
  const filenameBase = sanitizeFileComponent(downloadName.replace(/\.[a-z0-9]+$/i, ''));
  return {
    url: upload.url,
    publicId: upload.publicId,
    downloadUrl: buildRawAttachmentUrl({ publicId: upload.publicId, filenameBase, format }),
  };
}

function extFromDocumentUrl(documentUrl: string): 'pdf' | 'docx' {
  try {
    const u = new URL(documentUrl);
    const ext = path.extname(u.pathname).toLowerCase();
    if (ext === '.pdf') return 'pdf';
    if (ext === '.docx') return 'docx';
  } catch {
    // ignore
  }
  return 'docx';
}

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    requirePlatformAdminId(req);
    const { searchParams } = new URL(req.url);
    const companyId = parsePositiveInt(searchParams.get('companyId'));
    if (companyId === null) {
      return NextResponse.json({ error: 'Valid companyId is required' }, { status: 400, headers });
    }

    const rows = await prisma.commissionInvoice.findMany({
      where: { companyId },
      orderBy: [{ billingMonth: 'desc' }, { issuedAt: 'desc' }],
    });

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
    const companyName = company?.name ?? 'Company';

    return NextResponse.json(
      {
        invoices: rows.map((r) => {
          const ext = extFromDocumentUrl(r.documentUrl);
          const downloadName = buildDownloadName({
            billingMonth: r.billingMonth,
            companyName,
            ext,
          });
          const filenameBase = downloadName.replace(/\.[a-z0-9]+$/i, '');
          const downloadUrl = r.documentPublicId
            ? buildRawAttachmentUrl({ publicId: r.documentPublicId, filenameBase, format: ext })
            : r.documentUrl;
          return {
            id: r.id,
            invoiceNo: r.invoiceNo,
            companyId: r.companyId,
            billingMonth: r.billingMonth.toISOString(),
            amount: r.amount.toString(),
            currency: r.currency,
            status: r.status,
            issuedAt: r.issuedAt.toISOString(),
            dueAt: r.dueAt?.toISOString() ?? null,
            description: r.description ?? null,
            documentUrl: r.documentUrl,
            downloadName,
            downloadUrl,
            createdAt: r.createdAt.toISOString(),
          };
        }),
      },
      { status: 200, headers }
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    console.error('GET /api/platform-admin/commission-invoices', err);
    return NextResponse.json({ error: 'Failed to load commission invoices' }, { status: 500, headers });
  }
}

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'multipart/form-data is required' }, { status: 400, headers });
    }

    const formData = await req.formData();
    const companyId = parsePositiveInt(String(formData.get('companyId') ?? ''));
    const billingMonth = normalizeBillingMonth(String(formData.get('billingMonth') ?? ''));
    const amount = parseAmount(String(formData.get('amount') ?? ''));
    const currency = String(formData.get('currency') ?? 'IDR').trim() || 'IDR';
    const dueAtRaw = String(formData.get('dueAt') ?? '').trim();
    const dueAt = dueAtRaw ? new Date(dueAtRaw) : null;
    const description = String(formData.get('description') ?? '').trim() || null;

    if (companyId === null) return NextResponse.json({ error: 'Valid companyId is required' }, { status: 400, headers });
    if (!billingMonth) return NextResponse.json({ error: 'Valid billingMonth is required' }, { status: 400, headers });
    if (amount === null) return NextResponse.json({ error: 'Valid amount is required' }, { status: 400, headers });
    if (dueAt && Number.isNaN(dueAt.getTime())) {
      return NextResponse.json({ error: 'Invalid dueAt' }, { status: 400, headers });
    }

    const file = formData.get('file');
    const isFileOrBlob =
      file && (file instanceof File || (typeof Blob !== 'undefined' && (file as unknown) instanceof Blob));
    if (!isFileOrBlob) {
      return NextResponse.json({ error: 'Invoice file is required' }, { status: 400, headers });
    }

    const fileLike = file as File | Blob;
    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
    if (fileLike.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds maximum allowed (20MB)' }, { status: 400, headers });
    }
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404, headers });
    }
    const mimeType = String(fileLike.type ?? '').trim().toLowerCase();
    const ext = mimeType === 'application/pdf' ? 'pdf' : 'docx';
    const downloadName = buildDownloadName({ billingMonth, companyName: company.name, ext });
    const saved = await saveCommissionInvoiceDocumentWithName(fileLike, downloadName);

    // invoiceNo is unique at the DB level; retry on conflict to avoid race conditions.
    let created: Awaited<ReturnType<typeof prisma.commissionInvoice.create>> | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const invoiceNo = await nextInvoiceNo(billingMonth);
      try {
        created = await prisma.commissionInvoice.create({
          data: {
            invoiceNo,
            companyId,
            billingMonth,
            amount,
            currency,
            dueAt: dueAt ?? null,
            description,
            documentUrl: saved.url,
            documentPublicId: saved.publicId,
            createdByAdminId: adminId,
            status: 'PENDING',
          },
        });
        break;
      } catch (e) {
        lastErr = e;
        // P2002: Unique constraint failed
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          continue;
        }
        throw e;
      }
    }
    if (!created) {
      throw new Error(
        lastErr instanceof Error ? lastErr.message : 'Failed to create commission invoice (sequence conflict).'
      );
    }

    // Notify distributor dashboard users (bell + websocket refetch)
    void notifyCompanyUsers({
      companyId,
      type: 'billing',
      title: 'New commission invoice',
      message: `${monthLabelUTC(billingMonth)} commission invoice ${created.invoiceNo} has been submitted. Please pay by the due date (14-day grace period).`,
      metadata: {
        invoiceId: created.id,
        invoiceNo: created.invoiceNo,
        status: created.status,
        billingMonth: created.billingMonth.toISOString(),
      },
      actionUrl: '/settings',
    });

    return NextResponse.json(
      {
        invoice: {
          id: created.id,
          invoiceNo: created.invoiceNo,
          companyId: created.companyId,
          billingMonth: created.billingMonth.toISOString(),
          amount: created.amount.toString(),
          currency: created.currency,
          status: created.status,
          issuedAt: created.issuedAt.toISOString(),
          dueAt: created.dueAt?.toISOString() ?? null,
          description: created.description ?? null,
          documentUrl: created.documentUrl,
          downloadName,
          downloadUrl: saved.downloadUrl,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201, headers }
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    console.error('POST /api/platform-admin/commission-invoices', err);
    return NextResponse.json({ error: 'Failed to create commission invoice' }, { status: 500, headers });
  }
}

