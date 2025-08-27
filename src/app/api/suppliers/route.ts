import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../generated/prisma';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      let supplier;
      if (/^\d+$/.test(id)) {
        supplier = await prisma.supplier.findFirst({
          where: { id: Number(id), userId: Number(userId) }
        });
      } else {
        supplier = await prisma.supplier.findFirst({
          where: { supplierId: id, userId: Number(userId) }
        });
      }
      
      if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
      return NextResponse.json(supplier);
    }
    
    const suppliers = await prisma.supplier.findMany({
      where: { userId: Number(userId) }
    });
    return NextResponse.json(suppliers);
      } catch (err) {
      // GET /api/suppliers error
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
  try {
    let data = await req.json();
    if (!data.userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    
    // Clean and validate the data to match Prisma schema
    const supplierData = {
      supplierId: String(data.supplierId),
      name: String(data.name),
      contact: String(data.contact),
      email: String(data.email),
      phone: String(data.phone),
      businessType: String(data.businessType),
      address: String(data.address),
      status: String(data.status),
      logistics: data.logistics ? String(data.logistics) : null,
      notes: data.notes ? String(data.notes) : null,
      supplies: data.supplies ? String(data.supplies) : null,
      userId: Number(data.userId)
    };
    
    const supplier = await prisma.supplier.create({
      data: supplierData
    });
    
    return NextResponse.json(supplier, { status: 201 });
      } catch (err) {
      // POST /api/suppliers error
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    
    let deleted;
    if (/^\d+$/.test(id)) {
      deleted = await prisma.supplier.findFirst({
        where: { id: Number(id), userId: Number(userId) }
      });
      
      if (!deleted) {
        return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
      }
      
      await prisma.supplier.delete({
        where: { id: Number(id) }
      });
    } else {
      deleted = await prisma.supplier.findFirst({
        where: { supplierId: id, userId: Number(userId) }
      });
      
      if (!deleted) {
        return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
      }
      
      await prisma.supplier.delete({
        where: { supplierId: id }
      });
    }
    
    // DELETE Supplier
    return NextResponse.json({ success: true, deleted });
      } catch (err) {
      // DELETE /api/suppliers error
      return NextResponse.json({ error: 'Failed to delete supplier' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
  try {
    let data = await req.json();
    if (!data.userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    
    const { id, supplierId, userId, ...updateData } = data;
    const userIdNum = Number(userId);
    
    // Clean the update data to ensure proper types
    const cleanUpdateData: any = {};
    if (updateData.name !== undefined) cleanUpdateData.name = String(updateData.name);
    if (updateData.contact !== undefined) cleanUpdateData.contact = String(updateData.contact);
    if (updateData.email !== undefined) cleanUpdateData.email = String(updateData.email);
    if (updateData.phone !== undefined) cleanUpdateData.phone = String(updateData.phone);
    if (updateData.businessType !== undefined) cleanUpdateData.businessType = String(updateData.businessType);
    if (updateData.address !== undefined) cleanUpdateData.address = String(updateData.address);
    if (updateData.status !== undefined) cleanUpdateData.status = String(updateData.status);
    if (updateData.logistics !== undefined) cleanUpdateData.logistics = updateData.logistics ? String(updateData.logistics) : null;
    if (updateData.notes !== undefined) cleanUpdateData.notes = updateData.notes ? String(updateData.notes) : null;
    if (updateData.supplies !== undefined) cleanUpdateData.supplies = updateData.supplies ? String(updateData.supplies) : null;
    
    let supplier;
    if (id) {
      supplier = await prisma.supplier.update({
        where: { id: Number(id) },
        data: cleanUpdateData
      });
    } else if (supplierId) {
      supplier = await prisma.supplier.update({
        where: { supplierId: supplierId },
        data: cleanUpdateData
      });
    } else {
      return NextResponse.json({ error: 'Missing id or supplierId' }, { status: 400 });
    }
    
    // Ensure we always return the supplierId for proper routing
    const responseData = {
      ...supplier,
      supplierId: supplier.supplierId || supplierId
    };
    
    return NextResponse.json(responseData);
      } catch (err) {
      // PUT /api/suppliers error
      return NextResponse.json({ error: 'Failed to update supplier' }, { status: 500 });
    }
}
