import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../generated/prisma';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      let supplier;
      if (/^\d+$/.test(id)) {
        supplier = await prisma.supplier.findUnique({ where: { id: Number(id) } });
      } else {
        supplier = await prisma.supplier.findUnique({ where: { supplierId: id } });
      }
      if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
      return NextResponse.json(supplier);
    }
    const suppliers = await prisma.supplier.findMany();
    return NextResponse.json(suppliers);
  } catch (err) {
    console.error('GET /api/suppliers error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const supplier = await prisma.supplier.create({ data });
    return NextResponse.json(supplier, { status: 201 });
  } catch (err) {
    console.error('POST /api/suppliers error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    let deleted;
    if (/^\d+$/.test(id)) {
      deleted = await prisma.supplier.delete({ where: { id: Number(id) } });
    } else {
      deleted = await prisma.supplier.delete({ where: { supplierId: id } });
    }
    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    console.error('DELETE /api/suppliers error:', err);
    return NextResponse.json({ error: 'Failed to delete supplier' }, { status: 500 });
  }
}
