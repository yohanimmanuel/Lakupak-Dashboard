import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';
import { getSecurityHeaders } from '@/utils/auth-security';
import { buildRawAttachmentUrl } from '@/lib/cloudinary';
import path from 'path';

function parsePositiveInt(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n % 1 !== 0 || n < 1) return null;
  return n;
}

async function resolveCompanyIdForUser(userId: number): Promise<number | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return u?.companyId ?? null;
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
    const authenticatedUserId = await getAuthenticatedUserId(req);
    if (!authenticatedUserId) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401, headers });
    }

    const { searchParams } = new URL(req.url);
    const userId = parsePositiveInt(searchParams.get('userId'));
    if (userId === null) {
      return NextResponse.json({ error: 'Valid user ID is required' }, { status: 400, headers });
    }

    if (authenticatedUserId !== userId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403, headers });
    }

    const companyId = await resolveCompanyIdForUser(userId);
    if (!companyId) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404, headers });
    }

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404, headers });
    }

    const rows = await prisma.commissionInvoice.findMany({
      where: { companyId },
      orderBy: [{ billingMonth: 'desc' }, { issuedAt: 'desc' }],
    });

    return NextResponse.json(
      {
        invoices: rows.map((r) => {
          const ext = extFromDocumentUrl(r.documentUrl);
          const downloadName = buildDownloadName({
            billingMonth: r.billingMonth,
            companyName: company.name,
            ext,
          });
          const filenameBase = downloadName.replace(/\.[a-z0-9]+$/i, '');
          const downloadUrl = r.documentPublicId
            ? buildRawAttachmentUrl({
                publicId: r.documentPublicId,
                filenameBase,
                format: ext,
              })
            : r.documentUrl;

          return {
            id: r.id,
            invoiceNo: r.invoiceNo,
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
          };
        }),
      },
      { status: 200, headers }
    );
  } catch (err) {
    console.error('GET /api/company/commission-invoices', err);
    return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500, headers });
  }
}

