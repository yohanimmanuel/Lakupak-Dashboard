import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../generated/prisma';
import { getProductSecurityHeaders } from '../../../utils/product-security';

const prisma = new PrismaClient();

// GET /api/marketplace - Get published products for marketplace
export async function GET(request: NextRequest) {
  const headers = getProductSecurityHeaders();
  
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    
    // Build where clause for published products only
    const whereClause: any = {
      marketplaceStatus: 'Published',
      status: 'Published'
    };
    
    if (category && category !== 'All') {
      whereClause.category = category;
    }
    
    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    // Get published products with user info
    const products = await prisma.product.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            company: {
              select: {
                name: true,
                businessAddress: true,
                businessPhone: true,
                businessEmail: true
              }
            }
          }
        }
      },
      skip,
      take: limit,
      orderBy: { publishedAt: 'desc' }
    });
    
    // Transform products for marketplace format
    const marketplaceProducts = products.map(product => {
      // Convert price strings to numbers, handling different formats
      let sellingPrice = typeof product.sellingPrice === 'string' 
        ? parseFloat(product.sellingPrice.replace(/[^\d.-]/g, '')) || 0
        : product.sellingPrice || 0;
      
      let purchasePrice = typeof product.purchasePrice === 'string'
        ? parseFloat(product.purchasePrice.replace(/[^\d.-]/g, '')) || 0
        : product.purchasePrice || 0;
      
      // If prices seem too small (likely stored in thousands), multiply by 1000
      // This handles cases where 150 was entered instead of 150000
      if (sellingPrice > 0 && sellingPrice < 1000) {
        sellingPrice = sellingPrice * 1000;
      }
      if (purchasePrice > 0 && purchasePrice < 1000) {
        purchasePrice = purchasePrice * 1000;
      }
      
      return {
        id: product.productId,
        name: product.name,
        description: product.description,
        price: sellingPrice,
        originalPrice: purchasePrice,
         rating: 0, // Will be calculated from actual reviews
         reviewCount: 0, // Will be calculated from actual reviews
         soldCount: "0", // Will be calculated from actual orders
        stock: product.stockQuantity,
        stockStatus: product.stockStatus || 'In Stock',
        images: product.images || [],
        category: product.category,
        brand: product.brand,
        unit: product.packageType || 'pcs',
        packageType: product.packageType || 'pcs',
        piecesPerPackage: product.piecesPerPackage || 1,
         seller: {
           name: product.user?.company?.name || 'Unknown Company',
           avatar: '/default-avatar.png',
           rating: 0, // Will be calculated from actual seller reviews
           reviewCount: 0, // Will be calculated from actual seller reviews
           isOfficial: true, // Keep this as true for now
           responseTime: 'N/A', // Will be calculated from actual response times
           deliverySpeed: 'N/A', // Will be calculated from actual delivery data
           returnPolicy: `${product.returnPolicyDays || 7} days return policy`
         },
         shipping: {
           standard: { price: 0, free: true },
           express: { price: 0, free: false },
           sameDay: { price: 0, free: false }
         },
         shippingInfo: {
           location: 'Indonesia' // User region - country only for B2B
         },
        assurance: {
          halalCertified: product.halalCertified || false,
          bpomApproved: product.bpomApproved || false,
          returnPolicyDays: product.returnPolicyDays || 7,
          originalProduct: product.originalProduct !== false
        },
         reviews: {
           overallRating: 0,
           totalReviews: 0,
           breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
           sampleReview: null,
           hasReviews: false
         },
      // Additional fields for marketplace
      sku: product.sku,
      supplier: product.supplier,
      publishedAt: product.publishedAt,
      lastSyncAt: product.lastSyncAt
      };
    });
    
    const totalCount = await prisma.product.count({ where: whereClause });
    
    return NextResponse.json({
      products: marketplaceProducts,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    }, { headers });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch marketplace products' },
      { status: 500, headers }
    );
  }
}

// POST /api/marketplace/publish - Publish product to marketplace
export async function POST(request: NextRequest) {
  const headers = getProductSecurityHeaders();
  
  try {
    const body = await request.json();
    const { productId, userId, action } = body; // action: 'publish' | 'unpublish'
    
    if (!productId || !userId || !action) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400, headers }
      );
    }
    
    // Validate product exists and belongs to user
    const userIdNum = Number(userId);
    if (isNaN(userIdNum)) {
      return NextResponse.json(
        { error: 'Invalid userId format' },
        { status: 400, headers }
      );
    }
    
    const product = await prisma.product.findFirst({
      where: {
        productId,
        userId: userIdNum
      }
    });
    
    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404, headers }
      );
    }
    
    // Validate product is ready for publishing
    if (action === 'publish') {
      // Check if product has required fields for marketplace
      if (!product.name || !product.description || !product.sellingPrice) {
        return NextResponse.json(
          { error: 'Product must have name, description, and selling price' },
          { status: 400, headers }
        );
      }
      
      if (!product.images || product.images.length === 0) {
        return NextResponse.json(
          { error: 'Product must have at least one image' },
          { status: 400, headers }
        );
      }
    }
    
    // Update product marketplace status
    const updateData: any = {
      marketplaceStatus: action === 'publish' ? 'Published' : 'Unpublished',
      lastSyncAt: new Date()
    };
    
    if (action === 'publish') {
      updateData.publishedAt = new Date();
    }
    
    const updatedProduct = await prisma.product.update({
      where: { id: product.id },
      data: updateData
    });
    
    
    return NextResponse.json({
      success: true,
      product: updatedProduct,
      message: `Product ${action === 'publish' ? 'published to' : 'unpublished from'} marketplace successfully`
    }, { headers });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update marketplace status' },
      { status: 500, headers }
    );
  }
}
