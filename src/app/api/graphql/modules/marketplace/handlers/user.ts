import { prisma } from '../../common/prisma';
import { syncMarketplaceUserToBuyerProfiles } from '@/utils/buyerSync';

export const fetchMarketplaceUserProfile = async (userId: number) => {
  const user = await prisma.marketplaceUser.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return null;
  }

  return {
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
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
};

export const updateMarketplaceUser = async (args: { userId: number; input: {
  username?: string;
  name?: string;
  storeName?: string;
  email?: string;
  bio?: string;
  phone?: string;
  image?: string;
  bannerImage?: string;
  chosenAddress?: string;
  country?: string;
} }) => {
  const { userId, input } = args;
  
  // Check if user exists
  const existingUser = await prisma.marketplaceUser.findUnique({
    where: { id: userId }
  });
  
  if (!existingUser) {
    throw new Error('User not found');
  }
  
  const hasKey = (k: string) => Object.prototype.hasOwnProperty.call(input, k);
  const normalizedUsername =
    hasKey('username') && typeof input.username === 'string' && input.username.trim().length > 0
      ? input.username.trim()
      : undefined;
  const normalizedEmail =
    hasKey('email') && typeof input.email === 'string' && input.email.trim().length > 0
      ? input.email.trim().toLowerCase()
      : undefined;
  
  // Update user
  try {
    const updatedUser = await prisma.marketplaceUser.update({
      where: { id: userId },
      data: {
        ...(normalizedUsername !== undefined && normalizedUsername !== existingUser.username && { username: normalizedUsername }),
        ...(hasKey('name') && typeof input.name === 'string' && { name: input.name.trim() }),
        ...(hasKey('storeName') && typeof input.storeName === 'string' && { storeName: input.storeName.trim() }),
        ...(normalizedEmail !== undefined && normalizedEmail !== existingUser.email && { email: normalizedEmail }),
        ...(hasKey('bio') && typeof input.bio === 'string' && { bio: input.bio.trim() }),
        ...(hasKey('phone') && typeof input.phone === 'string' && { phone: input.phone.trim() }),
        ...(hasKey('image') && typeof input.image === 'string' && { image: input.image.trim() }),
        ...(hasKey('bannerImage') && typeof input.bannerImage === 'string' && { bannerImage: input.bannerImage.trim() }),
        ...(hasKey('chosenAddress') && typeof input.chosenAddress === 'string' && { chosenAddress: input.chosenAddress.trim() }),
        ...(hasKey('country') && typeof input.country === 'string' && { country: input.country.trim() }),
      }
    });

    // Keep distributor-scoped Buyer profiles live with Marketplace user edits.
    // (Orders remain snapshots and are not rewritten here.)
    await syncMarketplaceUserToBuyerProfiles(updatedUser.id);
    
    return {
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
      createdAt: updatedUser.createdAt.toISOString(),
      updatedAt: updatedUser.updatedAt.toISOString(),
    };
  } catch (e) {
    const prismaError = e as { code?: string; meta?: { target?: unknown } };
    if (prismaError?.code === 'P2002') {
      const target = prismaError.meta?.target;
      const fields = Array.isArray(target) ? (target as string[]) : [];
      if (fields.includes('username')) throw new Error('Username already taken');
      if (fields.includes('email')) throw new Error('Email already taken');
      throw new Error('Unique constraint violation');
    }
    throw e;
  }
};

