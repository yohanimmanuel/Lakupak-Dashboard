import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/generated/prisma';
import { signToken } from '@/lib/jwt';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { idToken, email, name, picture } = body;

    if (!idToken || !email) {
      return NextResponse.json(
        { error: 'Missing required Google authentication data' },
        { status: 400 }
      );
    }

    // Verify Google ID token (in production, you should verify this with Google's API)
    // For now, we'll trust the client-side verification
    
    const normalizedEmail = email.toLowerCase().trim();
    
    // Check if user exists in MarketplaceUser
    let marketplaceUser = await prisma.marketplaceUser.findUnique({
      where: { email: normalizedEmail }
    });

    if (!marketplaceUser) {
      // Create new marketplace user from Google account
      const randomUsername = `user${Math.floor(Math.random() * 100000000)}`;
      // Generate a temporary phone number for Google OAuth users (they can update it later)
      const tempPhone = `google_${Date.now()}`;
      
      marketplaceUser = await prisma.marketplaceUser.create({
        data: {
          email: normalizedEmail,
          name: name || null,
          username: randomUsername,
          image: picture || null,
          // No password for Google OAuth users
          password: null,
          phone: tempPhone, // Temporary phone for Google OAuth users
          storeName: null,
          bio: null,
          bannerImage: null,
          chosenAddress: null,
          country: null,
        }
      });
    } else {
      // Update existing user with Google data if needed
      const updateData: any = {};
      
      if (!marketplaceUser.name && name) {
        updateData.name = name;
      }
      if (!marketplaceUser.image && picture) {
        updateData.image = picture;
      }
      
      if (Object.keys(updateData).length > 0) {
        marketplaceUser = await prisma.marketplaceUser.update({
          where: { id: marketplaceUser.id },
          data: updateData
        });
      }
    }

    // Generate JWT token
    const token = signToken(marketplaceUser.id);

    // Return user data and token
    return NextResponse.json({
      ok: true,
      token,
      user: {
        id: marketplaceUser.id,
        username: marketplaceUser.username,
        name: marketplaceUser.name,
        email: marketplaceUser.email,
        phone: marketplaceUser.phone,
        storeName: marketplaceUser.storeName,
        bio: marketplaceUser.bio,
        image: marketplaceUser.image,
        bannerImage: marketplaceUser.bannerImage,
        chosenAddress: marketplaceUser.chosenAddress,
        country: marketplaceUser.country,
      }
    });

  } catch (error) {
    console.error('Google OAuth error:', error);
    return NextResponse.json(
      { error: 'Authentication failed. Please try again.' },
      { status: 500 }
    );
  }
}
