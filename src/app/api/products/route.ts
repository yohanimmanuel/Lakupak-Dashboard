import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../generated/prisma';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    
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
      
      if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      
      // GET /api/products - Returning product data
      return NextResponse.json(product);
    }
    
    const products = await prisma.product.findMany({
      where: { userId: Number(userId) }
    });
    return NextResponse.json(products);
  } catch (err) {
    console.error('GET /api/products error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let data = await req.json();
    // POST /api/products - Received data
    if (!data.userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    
    // Clean and validate the data to match Prisma schema
    const productData = {
      productId: String(data.productId || data.id),
      sku: String(data.sku),
      name: String(data.name),
      description: String(data.description),
      category: String(data.category),
      brand: String(data.brand),
      supplier: String(data.supplier),
      stockQuantity: Number(data.stockQuantity),
      lowStockThreshold: data.lowStockThreshold ? Number(data.lowStockThreshold) : null,
      stockStatus: data.stockStatus ? String(data.stockStatus) : null,
      purchasePrice: String(data.purchasePrice),
      sellingPrice: String(data.sellingPrice),
      status: String(data.status),
      catalogType: String(data.catalogType),
      catalogName: String(data.catalogName),
      images: Array.isArray(data.images) ? data.images : [],
      discount: data.discount ? Number(data.discount) : null,
      discountType: data.discountType ? String(data.discountType) : null,
      userId: Number(data.userId)
    };
    
    // POST /api/products - Cleaned data
    
    const product = await prisma.product.create({
      data: productData
    });
    
    return NextResponse.json(product, { status: 201 });
  } catch (err) {
    console.error('POST /api/products error:', err);
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
      deleted = await prisma.product.findFirst({
        where: { id: Number(id), userId: Number(userId) }
      });
      
      if (!deleted) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }
      
      await prisma.product.delete({
        where: { id: Number(id) }
      });
    } else {
      deleted = await prisma.product.findFirst({
        where: { productId: id, userId: Number(userId) }
      });
      
      if (!deleted) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }
      
      await prisma.product.delete({
        where: { productId: id }
      });
    }
    
    // DELETE Product
    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    console.error('DELETE /api/products error:', err);
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    let data = await req.json();
    // PUT /api/products - Received data
    if (!data.userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    
    const { id, productId, userId, ...updateData } = data;
    const userIdNum = Number(userId);
    
    // Clean the update data to ensure proper types
    const cleanUpdateData: any = {};
    if (updateData.sku !== undefined) cleanUpdateData.sku = String(updateData.sku);
    if (updateData.name !== undefined) cleanUpdateData.name = String(updateData.name);
    if (updateData.description !== undefined) cleanUpdateData.description = String(updateData.description);
    if (updateData.category !== undefined) cleanUpdateData.category = String(updateData.category);
    if (updateData.brand !== undefined) cleanUpdateData.brand = String(updateData.brand);
    if (updateData.supplier !== undefined) cleanUpdateData.supplier = String(updateData.supplier);
    if (updateData.stockQuantity !== undefined) cleanUpdateData.stockQuantity = Number(updateData.stockQuantity);
    if (updateData.lowStockThreshold !== undefined) cleanUpdateData.lowStockThreshold = updateData.lowStockThreshold ? Number(updateData.lowStockThreshold) : null;
    if (updateData.stockStatus !== undefined) cleanUpdateData.stockStatus = updateData.stockStatus ? String(updateData.stockStatus) : null;
         if (updateData.purchasePrice !== undefined) cleanUpdateData.purchasePrice = String(updateData.purchasePrice);
     if (updateData.sellingPrice !== undefined) cleanUpdateData.sellingPrice = String(updateData.sellingPrice);
    if (updateData.status !== undefined) cleanUpdateData.status = String(updateData.status);
    if (updateData.catalogType !== undefined) cleanUpdateData.catalogType = String(updateData.catalogType);
    if (updateData.catalogName !== undefined) cleanUpdateData.catalogName = String(updateData.catalogName);
    if (updateData.images !== undefined) cleanUpdateData.images = Array.isArray(updateData.images) ? updateData.images : [];
    if (updateData.discount !== undefined) cleanUpdateData.discount = updateData.discount ? Number(updateData.discount) : 0;
    if (updateData.discountType !== undefined) cleanUpdateData.discountType = updateData.discountType ? String(updateData.discountType) : null;
    
    // PUT /api/products - Cleaned update data
    
    let product;
    if (id) {
      product = await prisma.product.update({
        where: { id: Number(id) },
        data: cleanUpdateData
      });
    } else if (productId) {
      product = await prisma.product.update({
        where: { productId: productId },
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
    
    return NextResponse.json(responseData);
  } catch (err) {
    console.error('PUT /api/products error:', err);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}
