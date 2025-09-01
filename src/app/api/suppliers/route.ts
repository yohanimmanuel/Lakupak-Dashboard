import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../generated/prisma';
import { getSupplierSecurityHeaders, validateSupplierInput, sanitizeSupplierData, generateUniqueSupplierId } from '@/utils/supplier-security';


const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const headers = getSupplierSecurityHeaders();
  
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' }, 
        { status: 400, headers }
      );
    }
    
    // Validate userId format
    if (!/^\d+$/.test(userId)) {
      return NextResponse.json(
        { error: 'Invalid userId format' }, 
        { status: 400, headers }
      );
    }
    
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
      
      if (!supplier) {
        return NextResponse.json(
          { error: 'Supplier not found' }, 
          { status: 404, headers }
        );
      }
      return NextResponse.json(supplier, { headers });
    }
    
    const suppliers = await prisma.supplier.findMany({
      where: { userId: Number(userId) }
    });
    return NextResponse.json(suppliers, { headers });
    
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500, headers }
    );
  }
}

export async function POST(req: NextRequest) {
  const headers = getSupplierSecurityHeaders();
  
  try {
    const data = await req.json();
    
    if (!data.userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' }, 
        { status: 400, headers }
      );
    }
    
    // Validate userId format
    if (!/^\d+$/.test(String(data.userId))) {
      return NextResponse.json(
        { error: 'Invalid userId format' }, 
        { status: 400, headers }
      );
    }
    
    // Sanitize and prepare supplier data
    const supplierData = {
      supplierId: data.supplierId || '',
      name: data.name || '',
      contact: data.contact || '',
      email: data.email || '',
      phone: data.phone || '',
      businessType: data.businessType || '',
      address: data.address || '',
      status: data.status || 'Active',
      logistics: data.logistics || null,
      notes: data.notes || null,
      supplies: data.supplies || null,
      userId: Number(data.userId)
    };
    
    // Only check for unique supplierId - allow duplicate emails, names, etc. for MVP flexibility
    if (supplierData.supplierId) {
      const existingSupplier = await prisma.supplier.findFirst({
        where: { 
          supplierId: supplierData.supplierId, 
          userId: Number(data.userId) 
        }
      });
      
      if (existingSupplier) {
        return NextResponse.json(
          { error: 'Supplier with this ID already exists' }, 
          { status: 409, headers }
        );
      }
    }
    
    // Generate unique supplierId if not provided - ensure uniqueness
    if (!supplierData.supplierId) {
      let attempts = 0;
      let newSupplierId;
      do {
        newSupplierId = generateUniqueSupplierId();
        attempts++;
        if (attempts > 10) {
          return NextResponse.json(
            { error: 'Unable to generate unique supplier ID' }, 
            { status: 500, headers }
          );
        }
      } while (await prisma.supplier.findFirst({
        where: { supplierId: newSupplierId, userId: Number(data.userId) }
      }));
      supplierData.supplierId = newSupplierId;
    }
    
    const supplier = await prisma.supplier.create({
      data: supplierData
    });
    
    return NextResponse.json(supplier, { 
      status: 201, 
      headers: {
        ...headers,
        'Location': `/api/suppliers/${supplier.id}`
      }
    });
    
  } catch (error: unknown) {
    // Handle Prisma-specific errors
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Supplier with this ID already exists' }, 
        { status: 409, headers }
      );
    }
    
    // Provide more specific error messages
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      return NextResponse.json(
        { error: error.message }, 
        { status: 400, headers }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500, headers }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const headers = getSupplierSecurityHeaders();
  
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' }, 
        { status: 400, headers }
      );
    }
    
    // Validate userId format
    if (!/^\d+$/.test(userId)) {
      return NextResponse.json(
        { error: 'Invalid userId format' }, 
        { status: 400, headers }
      );
    }
    
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json(
        { error: 'Missing id parameter' }, 
        { status: 400, headers }
      );
    }
    
    let deleted;
    if (/^\d+$/.test(id)) {
      deleted = await prisma.supplier.findFirst({
        where: { id: Number(id), userId: Number(userId) }
      });
      
      if (!deleted) {
        return NextResponse.json(
          { error: 'Supplier not found' }, 
          { status: 404, headers }
        );
      }
      
      await prisma.supplier.delete({
        where: { id: Number(id) }
      });
    } else {
      deleted = await prisma.supplier.findFirst({
        where: { supplierId: id, userId: Number(userId) }
      });
      
      if (!deleted) {
        return NextResponse.json(
          { error: 'Supplier not found' }, 
          { status: 404, headers }
        );
      }
      
      await prisma.supplier.delete({
        where: { supplierId: id }
      });
    }
    
    return NextResponse.json({ success: true, deleted }, { headers });
    
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Failed to delete supplier' }, 
      { status: 500, headers }
    );
  }
}

export async function PUT(req: NextRequest) {
  const headers = getSupplierSecurityHeaders();
  
  try {
    const data = await req.json();
    
    if (!data.userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' }, 
        { status: 400, headers }
      );
    }
    
    // Validate userId format
    if (!/^\d+$/.test(String(data.userId))) {
      return NextResponse.json(
        { error: 'Invalid userId format' }, 
        { status: 400, headers }
      );
    }
    
    const { id, supplierId, userId, ...updateData } = data;
    const userIdNum = Number(userId);
    
    // Clean the update data to ensure proper types
    const cleanUpdateData: Partial<{
      name: string;
      contact: string;
      email: string;
      phone: string;
      businessType: string;
      address: string;
      status: string;
      logistics: string | null;
      notes: string | null;
      supplies: string | null;
    }> = {};
    
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
        data: cleanUpdateData }
      );
    } else {
      return NextResponse.json(
        { error: 'Missing id or supplierId' }, 
        { status: 400, headers }
      );
    }
    
    // Ensure we always return the supplierId for proper routing
    const responseData = {
      ...supplier,
      supplierId: supplier.supplierId || supplierId
    };
    
    return NextResponse.json(responseData, { headers });
    
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Failed to update supplier' }, 
      { status: 500, headers }
    );
  }
}
