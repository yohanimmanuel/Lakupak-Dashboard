import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../generated/prisma';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      let buyer;
      if (/^\d+$/.test(id)) {
        buyer = await prisma.buyer.findUnique({ where: { id: Number(id) } });
      } else {
        buyer = await prisma.buyer.findUnique({ where: { buyerId: id } });
      }
      if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
      return NextResponse.json(buyer);
    }
    const buyers = await prisma.buyer.findMany();
    return NextResponse.json(buyers);
  } catch (err) {
    console.error('GET /api/buyers error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const buyer = await prisma.buyer.create({ data });
    return NextResponse.json(buyer, { status: 201 });
  } catch (err) {
    console.error('POST /api/buyers error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    let deleted;
    if (/^\d+$/.test(id)) {
      deleted = await prisma.buyer.delete({ where: { id: Number(id) } });
    } else {
      deleted = await prisma.buyer.delete({ where: { buyerId: id } });
    }
    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    console.error('DELETE /api/buyers error:', err);
    return NextResponse.json({ error: 'Failed to delete buyer' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const data = await req.json();
    const { id, buyerId, ...updateData } = data;
    const where = id ? { id: Number(id) } : { buyerId: String(buyerId) };
    const buyer = await prisma.buyer.update({
      where,
      data: updateData,
    });
    return NextResponse.json(buyer);
  } catch (err) {
    console.error('PUT /api/buyers error:', err);
    return NextResponse.json({ error: 'Failed to update buyer' }, { status: 500 });
  }
}
