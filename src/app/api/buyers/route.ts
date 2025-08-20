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
      
      console.log('GET /api/buyers - Returning buyer data:', JSON.stringify(buyer, null, 2));
      return NextResponse.json(buyer);
    }
    
    const buyers = await prisma.buyer.findMany({
      where: { userId: Number(userId) }
    });
    return NextResponse.json(buyers);
  } catch (err) {
    console.error('GET /api/buyers error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let data = await req.json();
    console.log('POST /api/buyers - Received data:', JSON.stringify(data, null, 2));
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
    
    console.log('POST /api/buyers - Cleaned data:', JSON.stringify(buyerData, null, 2));
    
    const buyer = await prisma.buyer.create({
      data: buyerData
    });
    
    return NextResponse.json(buyer, { status: 201 });
  } catch (err) {
    console.error('POST /api/buyers error:', err);
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
    
    console.log('DELETE Buyer', { id, userId, deleted });
    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    console.error('DELETE /api/buyers error:', err);
    return NextResponse.json({ error: 'Failed to delete buyer' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    let data = await req.json();
    console.log('PUT /api/buyers - Received data:', JSON.stringify(data, null, 2));
    if (!data.userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    
    const { id, buyerId, userId, ...updateData } = data;
    const userIdNum = Number(userId);
    
    // Clean the update data to ensure proper types
    const cleanUpdateData: any = {};
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
    
    console.log('PUT /api/buyers - Cleaned update data:', JSON.stringify(cleanUpdateData, null, 2));
    
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
    
    return NextResponse.json(buyer);
  } catch (err) {
    console.error('PUT /api/buyers error:', err);
    return NextResponse.json({ error: 'Failed to update buyer' }, { status: 500 });
  }
}
