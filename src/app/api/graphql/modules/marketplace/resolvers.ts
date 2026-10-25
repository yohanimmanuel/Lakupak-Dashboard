import { fetchMarketplaceUserProfile, updateMarketplaceUser } from './handlers/user';
import {
  fetchMarketplaceAddresses,
  createMarketplaceAddress,
  updateMarketplaceAddress,
  deleteMarketplaceAddress,
} from './handlers/addresses';
import { fetchMarketplaceProducts } from '@/app/api/graphql/modules/marketplace/handlers/products';
import { fetchMobileCart, addToCart, updateCartItem, removeCartItem, clearCart } from './handlers/cart';
import { fetchMobileUserActivity, addUserActivity, deleteUserActivity } from './handlers/activity';
import { fetchMobileOrders } from './handlers/orders';
import {
  fetchMobileSearchHistory,
  addSearchHistory,
  removeSearchHistory,
  clearSearchHistory,
} from './handlers/searchHistory';
import { GraphQLError } from 'graphql';
import { prisma } from '../common/prisma';
import { isMarketplaceMember } from '@/lib/marketplace/access';
import {
  getContextUser,
  requireMarketplaceUser,
  withMarketplaceAuth,
} from '../common/auth';

export const marketplaceResolvers = {
  Query: {
    marketplaceUser: (_: unknown, args: { userId: number }, ctx: unknown) => {
      requireMarketplaceUser(ctx, args.userId);
      return fetchMarketplaceUserProfile(args.userId);
    },
    marketplaceAddresses: async (_: unknown, args: { userId: number }, ctx: unknown) => {
      requireMarketplaceUser(ctx, args.userId);
      return {
        success: true,
        addresses: await fetchMarketplaceAddresses(args.userId),
      };
    },
    mobileMarketplaceProducts: async (
      _: unknown,
      args: Parameters<typeof fetchMarketplaceProducts>[0],
      ctx: unknown,
    ) => {
      // Closed storefront: the referral code used at sign-in selects this session's distributor.
      const user = getContextUser(ctx);
      if (!user || user.type !== 'marketplace') {
        throw new GraphQLError('Sign in with your distributor referral code to view products', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
      return fetchMarketplaceProducts({
        ...args,
        marketplaceUserId: user.id,
        distributorIds: user.distributorId ? [user.distributorId] : [],
      });
    },
    mobileCart: async (_: unknown, args: { userId: number }, ctx: unknown) => {
      requireMarketplaceUser(ctx, args.userId);
      return fetchMobileCart(args.userId, getContextUser(ctx)?.distributorId ?? null);
    },
    mobileUserActivity: withMarketplaceAuth(fetchMobileUserActivity),
    mobileOrders: async (_: unknown, args: { userId: number; page?: number; limit?: number }, ctx: unknown) => {
      requireMarketplaceUser(ctx, args.userId);
      return fetchMobileOrders({
        ...args,
        distributorId: getContextUser(ctx)?.distributorId ?? null,
      });
    },
    mobileSearchHistory: withMarketplaceAuth(fetchMobileSearchHistory),
  },
  Mutation: {
    updateMarketplaceUser: withMarketplaceAuth(updateMarketplaceUser),
    createMarketplaceAddress: async (_: unknown, args: Parameters<typeof createMarketplaceAddress>[0], ctx: unknown) => {
      requireMarketplaceUser(ctx, args.userId);
      const address = await createMarketplaceAddress(args);
      if (!address) {
        return { success: false, message: 'Failed to create address', address: null };
      }
      return { success: true, message: 'Address created', address };
    },
    updateMarketplaceAddress: async (_: unknown, args: Parameters<typeof updateMarketplaceAddress>[0], ctx: unknown) => {
      requireMarketplaceUser(ctx, args.userId);
      return {
        success: true,
        message: 'Address updated',
        address: await updateMarketplaceAddress(args),
      };
    },
    deleteMarketplaceAddress: async (_: unknown, args: Parameters<typeof deleteMarketplaceAddress>[0], ctx: unknown) => {
      requireMarketplaceUser(ctx, args.userId);
      return {
        success: true,
        message: 'Address deleted',
        address: await deleteMarketplaceAddress(args),
      };
    },
    addToCart: async (_: unknown, args: { input: Parameters<typeof addToCart>[0] }, ctx: unknown) => {
      const authedUserId = requireMarketplaceUser(ctx, args.input.userId);
      const product = await prisma.product.findUnique({
        where: { productId: args.input.productId },
        select: { userId: true, status: true, marketplaceStatus: true },
      });
      if (
        !product ||
        product.status !== 'Published' ||
        product.marketplaceStatus !== 'Published' ||
        product.userId == null ||
        product.userId !== getContextUser(ctx)?.distributorId ||
        !(await isMarketplaceMember(authedUserId, product.userId))
      ) {
        return { success: false, cartItem: null, message: 'This product is not in your distributor storefront' };
      }
      return addToCart({ ...args.input, userId: authedUserId });
    },
    updateCartItem: async (_: unknown, args: { input: Parameters<typeof updateCartItem>[0] }, ctx: unknown) => {
      const user = getContextUser(ctx);
      if (!user || user.type !== 'marketplace') {
        return { success: false, cartItem: null, message: 'Unauthorized' };
      }
      const authedUserId = user.id;

      const existingItem = await prisma.userActivity.findUnique({
        where: { id: args.input.cartItemId },
        select: { userId: true },
      });

      if (!existingItem) {
        return { success: false, cartItem: null, message: 'Cart item not found' };
      }

      if (existingItem.userId !== authedUserId) {
        return { success: false, cartItem: null, message: 'Forbidden' };
      }

      return updateCartItem(args.input);
    },
    removeCartItem: async (_: unknown, args: { cartItemId: number }, ctx: unknown) => {
      const user = getContextUser(ctx);
      if (!user || user.type !== 'marketplace') {
        return { success: false, cartItem: null, message: 'Unauthorized' };
      }
      const authedUserId = user.id;

      const existingItem = await prisma.userActivity.findUnique({
        where: { id: args.cartItemId },
        select: { userId: true },
      });

      if (!existingItem) {
        return { success: false, cartItem: null, message: 'Cart item not found' };
      }

      if (existingItem.userId !== authedUserId) {
        return { success: false, cartItem: null, message: 'Forbidden' };
      }

      return removeCartItem(args.cartItemId);
    },
    clearCart: async (
      _: unknown,
      args: { userId: number; trackAbandonment?: boolean | null },
      ctx: unknown,
    ) => {
      const authedUserId = requireMarketplaceUser(ctx, args.userId);
      return clearCart(authedUserId, {
        trackAbandonment: args.trackAbandonment !== false,
      });
    },
    addUserActivity: async (_: unknown, args: { input: Parameters<typeof addUserActivity>[0] }, ctx: unknown) => {
      const authedUserId = requireMarketplaceUser(ctx, args.input.userId);
      return addUserActivity({ ...args.input, userId: authedUserId });
    },
    deleteUserActivity: withMarketplaceAuth(deleteUserActivity),
    addSearchHistory: withMarketplaceAuth(addSearchHistory),
    removeSearchHistory: withMarketplaceAuth(removeSearchHistory),
    clearSearchHistory: withMarketplaceAuth(clearSearchHistory),
  },
};
