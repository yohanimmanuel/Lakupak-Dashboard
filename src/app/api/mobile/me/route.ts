import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../../generated/prisma';
import { getSecurityHeaders } from '../../../../utils/auth-security';

const prisma = new PrismaClient();

// GET /api/mobile/me - Get current user profile
export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' }, 
        { status: 401, headers }
      );
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // For now, we'll extract user ID from the token format: mobile_token_{id}_{timestamp}
    // In production, you'd verify the JWT token properly
    const tokenMatch = token.match(/^mobile_token_(\d+)_\d+$/);
    if (!tokenMatch) {
      return NextResponse.json(
        { error: 'Invalid token format' }, 
        { status: 401, headers }
      );
    }
    
    const userId = parseInt(tokenMatch[1]);
    
    // Find the marketplace user
    const user = await prisma.marketplaceUser.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' }, 
        { status: 404, headers }
      );
    }
    
    // Return user data
    return NextResponse.json({
      id: user.id,
      username: user.username,
      name: user.name,
      storeName: user.storeName,
      email: user.email,
      bio: user.bio,
      phone: user.phone,
      image: user.image,
      bannerImage: user.bannerImage,
      chosenAddress: user.chosenAddress,
      country: user.country,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }, { 
      status: 200, 
      headers: {
        ...headers,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      }
    });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' }, 
      { status: 500, headers }
    );
  }
}

// PATCH /api/mobile/me - Update current user profile
export async function PATCH(req: NextRequest) {
  const headers = getSecurityHeaders();
  
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' }, 
        { status: 401, headers }
      );
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Extract user ID from token
    const tokenMatch = token.match(/^mobile_token_(\d+)_\d+$/);
    if (!tokenMatch) {
      return NextResponse.json(
        { error: 'Invalid token format' }, 
        { status: 401, headers }
      );
    }
    
    const userId = parseInt(tokenMatch[1]);
    
    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request format' }, 
        { status: 400, headers }
      );
    }
    
    const { username, name, storeName, email, bio, phone, image, bannerImage, chosenAddress, country } = body;
    
    // Check if user exists
    const existingUser = await prisma.marketplaceUser.findUnique({
      where: { id: userId }
    });
    
    if (!existingUser) {
      return NextResponse.json(
        { error: 'User not found' }, 
        { status: 404, headers }
      );
    }
    
    // Check for unique constraints if updating username or email
    if (username && username !== existingUser.username) {
      const usernameExists = await prisma.marketplaceUser.findUnique({
        where: { username: username.trim() }
      });
      if (usernameExists) {
        return NextResponse.json(
          { error: 'Username already taken' }, 
          { status: 409, headers }
        );
      }
    }
    
    if (email && email !== existingUser.email) {
      const emailExists = await prisma.marketplaceUser.findUnique({
        where: { email: email.trim().toLowerCase() }
      });
      if (emailExists) {
        return NextResponse.json(
          { error: 'Email already taken' }, 
          { status: 409, headers }
        );
      }
    }
    
    // Update user
    const updatedUser = await prisma.marketplaceUser.update({
      where: { id: userId },
      data: {
        ...(username && { username: username.trim() }),
        ...(name && { name: name.trim() }),
        ...(storeName && { storeName: storeName.trim() }),
        ...(email && { email: email.trim().toLowerCase() }),
        ...(bio && { bio: bio.trim() }),
        ...(phone && { phone: phone.trim() }),
        ...(image && { image: image.trim() }),
        ...(bannerImage && { bannerImage: bannerImage.trim() }),
        ...(chosenAddress && { chosenAddress: chosenAddress.trim() }),
        ...(country && { country: country.trim() })
      }
    });
    
    // Return updated user data
    return NextResponse.json({
      id: updatedUser.id,
      username: updatedUser.username,
      name: updatedUser.name,
      storeName: updatedUser.storeName,
      email: updatedUser.email,
      bio: updatedUser.bio,
      phone: updatedUser.phone,
      image: updatedUser.image,
      bannerImage: updatedUser.bannerImage,
      chosenAddress: updatedUser.chosenAddress,
      country: updatedUser.country,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt
    }, { 
      status: 200, 
      headers: {
        ...headers,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      }
    });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' }, 
      { status: 500, headers }
    );
  }
}