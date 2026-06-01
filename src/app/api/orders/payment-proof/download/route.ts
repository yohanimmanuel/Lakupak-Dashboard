import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';
import { getSecurityHeaders } from '@/utils/auth-security';
import {
  assertCloudinaryProofUrl,
  contentDispositionAttachment,
  contentTypeForProofUrl,
  paymentProofDownloadFilename,
} from '@/utils/paymentProof';

/**
 * GET /api/orders/payment-proof/download?orderId=LKO-...&index=0
 * Proxies Cloudinary proof with a proper Content-Disposition filename (same pattern as commission invoice download).
 */
export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Please log in.' }), {
        status: 401,
        headers: { ...headers, 'content-type': 'application/json' },
      });
    }

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId')?.trim();
    const indexRaw = searchParams.get('index') ?? '0';
    const index = parseInt(indexRaw, 10);

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'orderId is required' }), {
        status: 400,
        headers: { ...headers, 'content-type': 'application/json' },
      });
    }
    if (!Number.isFinite(index) || index < 0) {
      return new Response(JSON.stringify({ error: 'Invalid index' }), {
        status: 400,
        headers: { ...headers, 'content-type': 'application/json' },
      });
    }

    const order = await prisma.order.findFirst({
      where: { orderId, userId, isDeleted: false },
      select: {
        orderId: true,
        paymentProofUrls: true,
        paymentProofFileNames: true,
      },
    });

    if (!order) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { ...headers, 'content-type': 'application/json' },
      });
    }

    const url = order.paymentProofUrls[index];
    if (!url) {
      return new Response(JSON.stringify({ error: 'Payment proof not found' }), {
        status: 404,
        headers: { ...headers, 'content-type': 'application/json' },
      });
    }

    if (!assertCloudinaryProofUrl(url)) {
      return new Response(JSON.stringify({ error: 'Invalid proof URL' }), {
        status: 400,
        headers: { ...headers, 'content-type': 'application/json' },
      });
    }

    const storedFileName = order.paymentProofFileNames[index] ?? null;
    const filename = paymentProofDownloadFilename({
      orderId: order.orderId,
      url,
      storedFileName,
    });

    const upstream = await fetch(url, { cache: 'no-store' });
    if (!upstream.ok || !upstream.body) {
      return new Response(JSON.stringify({ error: 'Failed to fetch payment proof' }), {
        status: 502,
        headers: { ...headers, 'content-type': 'application/json' },
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...headers,
        'content-type': contentTypeForProofUrl(url),
        'content-disposition': contentDispositionAttachment(filename),
        'cache-control': 'no-store, no-cache, must-revalidate, private',
      },
    });
  } catch (err) {
    console.error('GET /api/orders/payment-proof/download', err);
    return new Response(JSON.stringify({ error: 'Failed to download payment proof' }), {
      status: 500,
      headers: { ...headers, 'content-type': 'application/json' },
    });
  }
}
