import { prisma } from '../common/prisma';

export const marketplaceTypeDefs = /* GraphQL */ `
  type MarketplaceUserProfile {
    id: Int!
    username: String!
    name: String
    storeName: String
    email: String
    bio: String
    phone: String!
    image: String
    bannerImage: String
    chosenAddress: String
    country: String
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    marketplaceUser(userId: Int!): MarketplaceUserProfile
  }
`;

const fetchMarketplaceUserProfile = async (userId: number) => {
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

export const marketplaceResolvers = {
  Query: {
    marketplaceUser: (_: unknown, args: { userId: number }) => fetchMarketplaceUserProfile(args.userId),
  },
};

