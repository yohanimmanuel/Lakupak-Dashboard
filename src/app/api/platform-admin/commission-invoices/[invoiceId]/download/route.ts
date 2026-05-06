import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';

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

function buildDownloadName(opts: { billingMonth: Date; companyName: string; ext: 'pdf' | 'docx' }): string {
  const m = monthLabelUTC(opts.billingMonth);
  const c = sanitizeFileComponent(opts.companyName);
  return `${m} Invoice for ${c}.${opts.ext}`;
}

function contentTypeForExt(ext: 'pdf' | 'docx'): string {
  if (ext === 'pdf') return 'application/pdf';
  return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

function contentDisposition(filename: string): string {
  const safe = filename.replace(/"/g, "'");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

function assertCloudinaryUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (u.hostname !== 'res.cloudinary.com') return false;
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
    if (cloudName && !u.pathname.startsWith(`/${cloudName}/`)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ invoiceId: string }> }) {
  const headers = getSecurityHeaders();
  try {
    requirePlatformAdminId(req);

    const { invoiceId } = await ctx.params;
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: 'Invalid invoiceId' }), {
        status: 400,
        headers: { ...headers, 'content-type': 'application/json' },
      });
    }

    const invoice = await prisma.commissionInvoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, companyId: true, billingMonth: true, documentUrl: true },
    });
    if (!invoice) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), {
        status: 404,
        headers: { ...headers, 'content-type': 'application/json' },
      });
    }

    const company = await prisma.company.findUnique({ where: { id: invoice.companyId }, select: { name: true } });
    const urlPath = new URL(invoice.documentUrl).pathname.toLowerCase();
    const ext: 'pdf' | 'docx' = urlPath.endsWith('.pdf') ? 'pdf' : 'docx';
    const filename = buildDownloadName({ billingMonth: invoice.billingMonth, companyName: company?.name ?? 'Company', ext });

    if (!assertCloudinaryUrl(invoice.documentUrl)) {
      return new Response(JSON.stringify({ error: 'Invalid document URL' }), {
        status: 400,
        headers: { ...headers, 'content-type': 'application/json' },
      });
    }

    const upstream = await fetch(invoice.documentUrl, { cache: 'no-store' });
    if (!upstream.ok || !upstream.body) {
      return new Response(JSON.stringify({ error: 'Failed to fetch document' }), {
        status: 502,
        headers: { ...headers, 'content-type': 'application/json' },
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...headers,
        'content-type': contentTypeForExt(ext),
        'content-disposition': contentDisposition(filename),
        'cache-control': 'no-store, no-cache, must-revalidate, private',
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...headers, 'content-type': 'application/json' },
      });
    }
    console.error('GET /api/platform-admin/commission-invoices/[invoiceId]/download', err);
    return new Response(JSON.stringify({ error: 'Failed to download invoice' }), {
      status: 500,
      headers: { ...headers, 'content-type': 'application/json' },
    });
  }
}

