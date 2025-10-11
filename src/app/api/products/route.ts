import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../generated/prisma';
import { 
  getProductSecurityHeaders, 
  validateProductInput, 
  sanitizeProductData,
  validateProductUpdate,
  generateUniqueProductId
} from '../../../utils/product-security';
import { parseNumberByCurrency } from '../../../config/currencyConfig';


const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const headers = getProductSecurityHeaders();
  
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
      let product;
      if (/^\d+$/.test(id)) {
        product = await prisma.product.findFirst({
          where: { id: Number(id), userId: Number(userId) }
        });
      } else {
        product = await prisma.product.findFirst({
          where: { productId: id, userId: Number(userId) }
        });
      }
      
      if (!product) {
        return NextResponse.json(
          { error: 'Product not found' }, 
          { status: 404, headers }
        );
      }
      
      // Check if product has active offers for badge display
      const activeOffers = await prisma.offer.findMany({
        where: {
          status: 'active',
          userId: Number(userId),
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
          offerProducts: {
            some: {
              productId: product.productId
            }
          }
        },
        include: {
          offerProducts: {
            where: {
              productId: product.productId
            }
          },
          offerDiscountTypes: {
            where: {
              isActive: true
            }
          }
        }
      });
      
      if (activeOffers.length > 0) {
        const primaryOffer = activeOffers[0] as any;
        
        // Filter to only ACTIVE discount types
        const discountTypes = primaryOffer.offerDiscountTypes.filter((dt: any) => dt.isActive !== false);
        
        const hasDiscount = discountTypes.some((dt: any) => 
          dt.discountType === 'percentage' || dt.discountType === 'fixed'
        );
        const hasPromotion = discountTypes.some((dt: any) => 
          dt.discountType === 'buy_x_get_y'
        );
        
        let offerBadge = 'Offer';
        if (hasDiscount && hasPromotion) {
          offerBadge = 'All Offers';
        } else if (hasPromotion) {
          offerBadge = 'Promotion';
        } else if (hasDiscount) {
          offerBadge = 'Discount';
        }
        
        // Get Buy X Get Y promotion details
        const buyXGetYPromo = discountTypes.find((dt: any) => dt.discountType === 'buy_x_get_y');
        const promotionDetails = buyXGetYPromo ? {
          minQuantity: buyXGetYPromo.minQuantity,
          freeQuantity: buyXGetYPromo.discountValue,
          description: buyXGetYPromo.description || `Buy ${buyXGetYPromo.minQuantity} Get ${buyXGetYPromo.discountValue} Free`
        } : undefined;
        
        return NextResponse.json({
          ...product,
          offerBadge,
          originalPrice: product.originalSellingPrice || undefined,
          hasActiveOffer: true,
          offerId: primaryOffer.id,
          offerName: primaryOffer.name,
          promotionDetails
        }, { headers });
      }
      
      return NextResponse.json(product, { headers });
    }
    
    // Get all products with pagination support
    const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');
    const search = req.nextUrl.searchParams.get('search') || '';
    const status = req.nextUrl.searchParams.get('status') || '';
    const productType = req.nextUrl.searchParams.get('productType') || req.nextUrl.searchParams.get('category') || '';
    
    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 1000) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters' }, 
        { status: 400, headers }
      );
    }
    
    // Build where clause
    const whereClause: {
      userId: number;
      OR?: Array<{
        name?: { contains: string; mode: 'insensitive' };
        sku?: { contains: string; mode: 'insensitive' };
        productType?: { contains: string; mode: 'insensitive' };
        brand?: { contains: string; mode: 'insensitive' };
        supplier?: { contains: string; mode: 'insensitive' };
      }>;
      status?: string;
      productType?: string;
    } = { userId: Number(userId) };
    
    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { productType: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { supplier: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    if (status && status !== 'All') {
      whereClause.status = status;
    }
    
    if (productType && productType !== 'All Categories') {
      whereClause.productType = productType;
    }
    
    // Get total count for pagination
    const totalCount = await prisma.product.count({ where: whereClause });
    
    // Get paginated results
    const products = await prisma.product.findMany({
      where: whereClause,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' }
    });
    
    // Fetch active offers for all products
    const productIds = products.map(p => p.productId);
    const activeOffers = await prisma.offer.findMany({
      where: {
        status: 'active',
        userId: Number(userId),
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
        offerProducts: {
          some: {
            productId: { in: productIds }
          }
        }
      },
      include: {
        offerProducts: {
          where: {
            productId: { in: productIds }
          }
        },
        offerDiscountTypes: {
          where: {
            isActive: true
          },
          orderBy: {
            priority: 'desc'
          }
        }
      }
    });
    
    // Map offers to products
    const productsWithOffers = products.map(product => {
      const productOffers = activeOffers.filter((offer: any) => 
        offer.offerProducts.some((p: any) => p.productId === product.productId)
      );
      
      if (productOffers.length === 0) {
        return product;
      }
      
      // Get the highest priority offer
      const primaryOffer = productOffers[0] as any;
      
      // Filter to only ACTIVE discount types
      const discountTypes = primaryOffer.offerDiscountTypes.filter((dt: any) => dt.isActive !== false);
      
      // Determine badge type based on applied discount types
      const hasDiscount = discountTypes.some((dt: any) => 
        dt.discountType === 'percentage' || dt.discountType === 'fixed'
      );
      const hasPromotion = discountTypes.some((dt: any) => 
        dt.discountType === 'buy_x_get_y'
      );
      
      let offerBadge = 'Offer';
      if (hasDiscount && hasPromotion) {
        offerBadge = 'All Offers';
      } else if (hasPromotion) {
        offerBadge = 'Promotion';
      } else if (hasDiscount) {
        offerBadge = 'Discount';
      }
      
      // Get Buy X Get Y promotion details
      const buyXGetYPromo = discountTypes.find((dt: any) => dt.discountType === 'buy_x_get_y');
      const promotionDetails = buyXGetYPromo ? {
        minQuantity: buyXGetYPromo.minQuantity,
        freeQuantity: buyXGetYPromo.discountValue,
        description: buyXGetYPromo.description || `Buy ${buyXGetYPromo.minQuantity} Get ${buyXGetYPromo.discountValue} Free`
      } : undefined;
      
      return {
        ...product,
        offerBadge,
        originalPrice: product.originalSellingPrice || undefined,
        hasActiveOffer: true,
        offerId: primaryOffer.id,
        offerName: primaryOffer.name,
        promotionDetails
      };
    });
    
    return NextResponse.json({
      products: productsWithOffers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    }, { headers });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500, headers }
    );
  }
}

export async function POST(req: NextRequest) {
  const headers = getProductSecurityHeaders();
  
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
    
    // Sanitize and prepare product data
    const productData = {
      productId: data.productId || generateUniqueProductId(),
      sku: data.sku || '',
      name: data.name || '',
      description: data.description || '',
      productType: data.productType || '',
      brand: data.brand || '',
      supplier: data.supplier || '',
      stockQuantity: Number(data.stockQuantity) || 0,
      lowStockThreshold: data.lowStockThreshold ? Number(data.lowStockThreshold) : null,
      stockStatus: data.stockStatus || null,
      // Package information
      packageType: data.packageType || null,
      piecesPerPackage: data.piecesPerPackage ? Number(data.piecesPerPackage) : 1,
      purchasePrice: String(parseNumberByCurrency(String(data.purchasePrice || ''), data.currency || 'IDR')),
      sellingPrice: String(parseNumberByCurrency(String(data.sellingPrice || ''), data.currency || 'IDR')),
      status: data.status || 'Draft',
      productCategory: data.productCategory || '',
      catalogName: data.catalogName || '',
      images: Array.isArray(data.images) ? data.images : [],
      // Product assurance fields
      halalCertified: data.halalCertified === true,
      bpomApproved: data.bpomApproved === true,
      originalProduct: data.originalProduct !== false,
      returnPolicyDays: data.returnPolicyDays !== undefined ? Number(data.returnPolicyDays) : 7,
      userId: Number(data.userId)
    };
    
    // Check for unique productId
    if (productData.productId) {
      const existingProduct = await prisma.product.findFirst({
        where: { productId: productData.productId, userId: productData.userId }
      });
      
      if (existingProduct) {
        // Generate a new unique ID and retry
        productData.productId = generateUniqueProductId();
      }
    }
    
    const product = await prisma.product.create({
      data: productData as any
    });
    
    return NextResponse.json(product, { status: 201, headers });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500, headers }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const headers = getProductSecurityHeaders();
  
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
      deleted = await prisma.product.findFirst({
        where: { id: Number(id), userId: Number(userId) }
      });
      
      if (!deleted) {
        return NextResponse.json(
          { error: 'Product not found' }, 
          { status: 404, headers }
        );
      }
      
      await prisma.product.delete({
        where: { id: Number(id) }
      });
    } else {
      deleted = await prisma.product.findFirst({
        where: { productId: id, userId: Number(userId) }
      });
      
      if (!deleted) {
        return NextResponse.json(
          { error: 'Product not found' }, 
          { status: 404, headers }
        );
      }
      
      await prisma.product.delete({
        where: { productId: id }
      });
    }
    
    return NextResponse.json({ success: true, deleted }, { headers });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Failed to delete product' }, 
      { status: 500, headers }
    );
  }
}

export async function PUT(req: NextRequest) {
  const headers = getProductSecurityHeaders();
  
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
    
    const { id, productId, userId, ...updateData } = data;
    const userIdNum = Number(userId);
    
    // Clean the update data to ensure proper types
    const cleanUpdateData: Partial<{
      sku: string;
      name: string;
      description: string;
      productType: string;
      brand: string;
      supplier: string;
      stockQuantity: number;
      lowStockThreshold: number | null;
      stockStatus: string | null;
      // Package information
      packageType: string | null;
      piecesPerPackage: number;
      purchasePrice: string;
      sellingPrice: string;
      status: string;
      productCategory: string;
      catalogName: string;
      images: string[];
      halalCertified: boolean;
      bpomApproved: boolean;
      originalProduct: boolean;
      returnPolicyDays: number;
    }> = {};
    if (updateData.sku !== undefined) cleanUpdateData.sku = String(updateData.sku);
    if (updateData.name !== undefined) cleanUpdateData.name = String(updateData.name);
    if (updateData.description !== undefined) cleanUpdateData.description = String(updateData.description);
    if ((updateData as any).productType !== undefined) (cleanUpdateData as any).productType = String((updateData as any).productType);
    if (updateData.brand !== undefined) cleanUpdateData.brand = String(updateData.brand);
    if (updateData.supplier !== undefined) cleanUpdateData.supplier = String(updateData.supplier);
    if (updateData.stockQuantity !== undefined) cleanUpdateData.stockQuantity = Number(updateData.stockQuantity);
    if (updateData.lowStockThreshold !== undefined) cleanUpdateData.lowStockThreshold = updateData.lowStockThreshold ? Number(updateData.lowStockThreshold) : null;
    if (updateData.stockStatus !== undefined) cleanUpdateData.stockStatus = updateData.stockStatus ? String(updateData.stockStatus) : null;
    // Package information
    if (updateData.packageType !== undefined) cleanUpdateData.packageType = updateData.packageType ? String(updateData.packageType) : null;
    if (updateData.piecesPerPackage !== undefined) cleanUpdateData.piecesPerPackage = updateData.piecesPerPackage ? Number(updateData.piecesPerPackage) : 1;
         if (updateData.purchasePrice !== undefined) cleanUpdateData.purchasePrice = String(parseNumberByCurrency(String(updateData.purchasePrice), data.currency || 'IDR'));
     if (updateData.sellingPrice !== undefined) cleanUpdateData.sellingPrice = String(parseNumberByCurrency(String(updateData.sellingPrice), data.currency || 'IDR'));
    if (updateData.status !== undefined) cleanUpdateData.status = String(updateData.status);
    if ((updateData as any).productCategory !== undefined) (cleanUpdateData as any).productCategory = String((updateData as any).productCategory);
    if (updateData.catalogName !== undefined) cleanUpdateData.catalogName = String(updateData.catalogName);
    if (updateData.images !== undefined) cleanUpdateData.images = Array.isArray(updateData.images) ? updateData.images : [];
    if (updateData.halalCertified !== undefined) cleanUpdateData.halalCertified = Boolean(updateData.halalCertified);
    if (updateData.bpomApproved !== undefined) cleanUpdateData.bpomApproved = Boolean(updateData.bpomApproved);
    if (updateData.originalProduct !== undefined) cleanUpdateData.originalProduct = Boolean(updateData.originalProduct);
    if (updateData.returnPolicyDays !== undefined) cleanUpdateData.returnPolicyDays = Number(updateData.returnPolicyDays);
    
    // PUT /api/products - Cleaned update data
    
    let product;
    if (id) {
      product = await prisma.product.update({
        where: { id: Number(id), userId: userIdNum },
        data: cleanUpdateData
      });
    } else if (productId) {
      product = await prisma.product.update({
        where: { productId: productId, userId: userIdNum },
        data: cleanUpdateData
      });
    } else {
      return NextResponse.json({ error: 'Missing id or productId' }, { status: 400 });
    }
    
    // Ensure we always return the productId for proper routing
    const responseData = {
      ...product,
      productId: product.productId || productId
    };
    
    return NextResponse.json(responseData, { headers });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Failed to update product' }, 
      { status: 500, headers }
    );
  }
}
