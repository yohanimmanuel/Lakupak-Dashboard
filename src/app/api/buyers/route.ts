import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../generated/prisma';
import { 
  validateBuyerInput, 
  getSecurityHeaders, 
  sanitizeBuyerData,
  validateBuyerUpdate
} from '../../../utils/buyer-security';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  
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
      
      if (!buyer) {
        return NextResponse.json(
          { error: 'Buyer not found' }, 
          { status: 404, headers }
        );
      }
      
      return NextResponse.json(buyer, { headers });
    }
    
    // Get all buyers with pagination support
    const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');
    const search = req.nextUrl.searchParams.get('search') || '';
    const status = req.nextUrl.searchParams.get('status') || '';
    const businessType = req.nextUrl.searchParams.get('businessType') || '';
    
    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters' }, 
        { status: 400, headers }
      );
    }
    
    // Build where clause
    const whereClause: any = { userId: Number(userId) };
    
    if (search) {
      whereClause.OR = [
        { storeName: { contains: search, mode: 'insensitive' } },
        { owner: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    if (status && status !== 'All') {
      whereClause.status = status;
    }
    
    if (businessType && businessType !== 'All Types') {
      whereClause.businessType = businessType;
    }
    
    // Get total count for pagination
    const totalCount = await prisma.buyer.count({ where: whereClause });
    
    // Get paginated results
    const buyers = await prisma.buyer.findMany({
      where: whereClause,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' }
    });
    
    return NextResponse.json({
      buyers,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    }, { headers });
    
  } catch (error) {
    // Log error for monitoring (no console.log)
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500, headers }
    );
  }
}

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  
  try {
    let data;
    try {
      data = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request format' }, 
        { status: 400, headers }
      );
    }
    
    if (!data.userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' }, 
        { status: 400, headers }
      );
    }
    
    // Validate userId format
    if (!/^\d+$/.test(data.userId.toString())) {
      return NextResponse.json(
        { error: 'Invalid userId format' }, 
        { status: 400, headers }
      );
    }
    
    // Validate buyer data
    const validationResult = validateBuyerInput(data);
    if (!validationResult.valid) {
      return NextResponse.json(
        { error: validationResult.error }, 
        { status: 400, headers }
      );
    }
    
    // Sanitize and clean the data
    const buyerData = sanitizeBuyerData(data);
    
    // Check if buyer with same email already exists for this user
    const existingBuyer = await prisma.buyer.findFirst({
      where: { 
        email: buyerData.email, 
        userId: Number(data.userId) 
      }
    });
    
    if (existingBuyer) {
      return NextResponse.json(
        { error: 'Buyer with this email already exists' }, 
        { status: 409, headers }
      );
    }
    
    // Generate unique buyerId if not provided
    if (!buyerData.buyerId) {
      buyerData.buyerId = 'LKB-' + Math.floor(10000000 + Math.random() * 90000000).toString();
    }
    
    const buyer = await prisma.buyer.create({
      data: buyerData
    });
    
    return NextResponse.json(buyer, { 
      status: 201, 
      headers: {
        ...headers,
        'Location': `/api/buyers/${buyer.id}`
      }
    });
    
  } catch (error: any) {
    // Handle Prisma-specific errors
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Buyer with this identifier already exists' }, 
        { status: 409, headers }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500, headers }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const headers = getSecurityHeaders();
  
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
      deleted = await prisma.buyer.findFirst({
        where: { id: Number(id), userId: Number(userId) }
      });
      
      if (!deleted) {
        return NextResponse.json(
          { error: 'Buyer not found' }, 
          { status: 404, headers }
        );
      }
      
      await prisma.buyer.delete({
        where: { id: Number(id) }
      });
    } else {
      deleted = await prisma.buyer.findFirst({
        where: { buyerId: id, userId: Number(userId) }
      });
      
      if (!deleted) {
        return NextResponse.json(
          { error: 'Buyer not found' }, 
          { status: 404, headers }
        );
      }
      
      await prisma.buyer.delete({
        where: { buyerId: id }
      });
    }
    
    return NextResponse.json({ 
      success: true, 
      deleted,
      message: 'Buyer deleted successfully'
    }, { headers });
    
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to delete buyer' }, 
      { status: 500, headers }
    );
  }
}

export async function PUT(req: NextRequest) {
  const headers = getSecurityHeaders();
  
  try {
    let data;
    try {
      data = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request format' }, 
        { status: 400, headers }
      );
    }
    
    if (!data.userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' }, 
        { status: 400, headers }
      );
    }
    
    // Validate userId format
    if (!/^\d+$/.test(data.userId.toString())) {
      return NextResponse.json(
        { error: 'Invalid userId format' }, 
        { status: 400, headers }
      );
    }
    
    const { id, buyerId, userId, ...updateData } = data;
    
    // Validate update data
    const validationResult = validateBuyerUpdate(updateData);
    if (!validationResult.valid) {
      return NextResponse.json(
        { error: validationResult.error }, 
        { status: 400, headers }
      );
    }
    
    // Check if buyer exists and belongs to user
    let existingBuyer;
    if (id) {
      existingBuyer = await prisma.buyer.findFirst({
        where: { id: Number(id), userId: Number(userId) }
      });
    } else if (buyerId) {
      existingBuyer = await prisma.buyer.findFirst({
        where: { buyerId: buyerId, userId: Number(userId) }
      });
    } else {
      return NextResponse.json(
        { error: 'Missing id or buyerId parameter' }, 
        { status: 400, headers }
      );
    }
    
    if (!existingBuyer) {
      return NextResponse.json(
        { error: 'Buyer not found' }, 
        { status: 404, headers }
      );
    }
    
    // Check for email conflicts if email is being updated
    if (updateData.email && updateData.email !== existingBuyer.email) {
      const emailConflict = await prisma.buyer.findFirst({
        where: { 
          email: updateData.email, 
          userId: Number(userId),
          id: { not: existingBuyer.id }
        }
      });
      
      if (emailConflict) {
        return NextResponse.json(
          { error: 'Another buyer with this email already exists' }, 
          { status: 409, headers }
        );
      }
    }
    
    // Sanitize update data
    const cleanUpdateData = sanitizeBuyerData(updateData);
    
    // Update buyer
    let buyer;
    if (id) {
      buyer = await prisma.buyer.update({
        where: { id: Number(id) },
        data: cleanUpdateData
      });
    } else {
      buyer = await prisma.buyer.update({
        where: { buyerId: buyerId },
        data: cleanUpdateData
      });
    }
    
    // Ensure we always return the buyerId for proper routing
    const responseData = {
      ...buyer,
      buyerId: buyer.buyerId || buyerId
    };
    
    return NextResponse.json(responseData, { headers });
    
  } catch (error: any) {
    // Handle Prisma-specific errors
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Buyer with this identifier already exists' }, 
        { status: 409, headers }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to update buyer' }, 
      { status: 500, headers }
    );
  }
}
