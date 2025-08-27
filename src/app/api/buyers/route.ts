import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../generated/prisma';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      let buyer;
      if (/^\d+$/.test(id)) {
        buyer = await prisma.buyer.findFirst({
          where: { id: Number(id), userId: Number(userId) }
        });
      } else {
        buyer = await prisma.buyer.findFirst({
          where: { buyerId: id, userId: Number(userId) }
        });
      }
      
      if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
      
      // GET /api/buyers - Returning buyer data
      return NextResponse.json(buyer);
    }
    
    const buyers = await prisma.buyer.findMany({
      where: { userId: Number(userId) }
    });
    return NextResponse.json(buyers);
  } catch (err) {
    // GET /api/buyers error
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let data = await req.json();
    // POST /api/buyers - Received data
    if (!data.userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    
    // Clean and validate the data to match Prisma schema
    const buyerData = {
      buyerId: String(data.buyerId),
      avatar: data.avatar ? String(data.avatar) : null,
      owner: String(data.owner),
      email: String(data.email),
      phone: String(data.phone),
      storeName: String(data.storeName),
      businessType: String(data.businessType),
      address: String(data.address),
      status: String(data.status),
      logistics: data.logistics ? String(data.logistics) : null,
      notes: data.notes ? String(data.notes) : null,
      orderDetails: data.orderDetails ? String(data.orderDetails) : null,
      userId: Number(data.userId)
    };
    
    // POST /api/buyers - Cleaned data
    
    const buyer = await prisma.buyer.create({
      data: buyerData
    });
    
    return NextResponse.json(buyer, { status: 201 });
      } catch (err) {
      // POST /api/buyers error
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
      deleted = await prisma.buyer.findFirst({
        where: { id: Number(id), userId: Number(userId) }
      });
      
      if (!deleted) {
        return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
      }
      
      await prisma.buyer.delete({
        where: { id: Number(id) }
      });
    } else {
      deleted = await prisma.buyer.findFirst({
        where: { buyerId: id, userId: Number(userId) }
      });
      
      if (!deleted) {
        return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
      }
      
      await prisma.buyer.delete({
        where: { buyerId: id }
      });
    }
    
    // DELETE Buyer
    return NextResponse.json({ success: true, deleted });
      } catch (err) {
      // DELETE /api/buyers error
      return NextResponse.json({ error: 'Failed to delete buyer' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
  try {
    let data = await req.json();
    // PUT /api/buyers - Received data
    if (!data.userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    
    const { id, buyerId, userId, ...updateData } = data;
    const userIdNum = Number(userId);
    
    // Clean the update data to ensure proper types
    const cleanUpdateData: Partial<{
      avatar: string | null;
      owner: string;
      email: string;
      phone: string;
      storeName: string;
      businessType: string;
      address: string;
      status: string;
      logistics: string | null;
      notes: string | null;
      orderDetails: string | null;
    }> = {};
    if (updateData.avatar !== undefined) cleanUpdateData.avatar = updateData.avatar ? String(updateData.avatar) : null;
    if (updateData.owner !== undefined) cleanUpdateData.owner = String(updateData.owner);
    if (updateData.email !== undefined) cleanUpdateData.email = String(updateData.email);
    if (updateData.phone !== undefined) cleanUpdateData.phone = String(updateData.phone);
    if (updateData.storeName !== undefined) cleanUpdateData.storeName = String(updateData.storeName);
    if (updateData.businessType !== undefined) cleanUpdateData.businessType = String(updateData.businessType);
    if (updateData.address !== undefined) cleanUpdateData.address = String(updateData.address);
    if (updateData.status !== undefined) cleanUpdateData.status = String(updateData.status);
    if (updateData.logistics !== undefined) cleanUpdateData.logistics = updateData.logistics ? String(updateData.logistics) : null;
    if (updateData.notes !== undefined) cleanUpdateData.notes = updateData.notes ? String(updateData.notes) : null;
    if (updateData.orderDetails !== undefined) cleanUpdateData.orderDetails = updateData.orderDetails ? String(updateData.orderDetails) : null;
    
    // PUT /api/buyers - Cleaned update data
    
    let buyer;
    if (id) {
      buyer = await prisma.buyer.update({
        where: { id: Number(id) },
        data: cleanUpdateData
      });
    } else if (buyerId) {
      buyer = await prisma.buyer.update({
        where: { buyerId: buyerId },
        data: cleanUpdateData
      });
    } else {
      return NextResponse.json({ error: 'Missing id or buyerId' }, { status: 400 });
    }
    
    // Ensure we always return the buyerId for proper routing
    const responseData = {
      ...buyer,
      buyerId: buyer.buyerId || buyerId
    };
    
          return NextResponse.json(responseData);
      } catch (err) {
      // PUT /api/buyers error
      console.error('PUT /api/buyers error:', err);
      return NextResponse.json({ error: 'Failed to update buyer', details: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
    }
}
