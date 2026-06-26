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
import { prisma } from '../common/prisma';

function getContextUserId(ctx: unknown): number | null {
  const id = (ctx as { user?: { id?: unknown } } | null | undefined)?.user?.id;
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
}

export const marketplaceResolvers = {
  Query: {
    marketplaceUser: (_: unknown, args: { userId: number }) => fetchMarketplaceUserProfile(args.userId),
    marketplaceAddresses: async (_: unknown, args: { userId: number }) => ({
      success: true,
      addresses: await fetchMarketplaceAddresses(args.userId),
    }),
    mobileMarketplaceProducts: (_: unknown, args: Parameters<typeof fetchMarketplaceProducts>[0]) => fetchMarketplaceProducts(args),
    mobileCart: (_: unknown, args: { userId: number }) => fetchMobileCart(args.userId),
    mobileUserActivity: (_: unknown, args: Parameters<typeof fetchMobileUserActivity>[0]) => fetchMobileUserActivity(args),
    mobileOrders: (_: unknown, args: Parameters<typeof fetchMobileOrders>[0]) => fetchMobileOrders(args),
    mobileSearchHistory: (_: unknown, args: Parameters<typeof fetchMobileSearchHistory>[0]) => fetchMobileSearchHistory(args),
  },
  Mutation: {
    updateMarketplaceUser: (_: unknown, args: Parameters<typeof updateMarketplaceUser>[0]) => updateMarketplaceUser(args),
    createMarketplaceAddress: async (_: unknown, args: Parameters<typeof createMarketplaceAddress>[0]) => {
      const address = await createMarketplaceAddress(args);
      if (!address) {
        return { success: false, message: 'Failed to create address', address: null };
      }
      return { success: true, message: 'Address created', address };
    },
    updateMarketplaceAddress: async (_: unknown, args: Parameters<typeof updateMarketplaceAddress>[0]) => ({
      success: true,
      message: 'Address updated',
      address: await updateMarketplaceAddress(args),
    }),
    deleteMarketplaceAddress: async (_: unknown, args: Parameters<typeof deleteMarketplaceAddress>[0]) => ({
      success: true,
      message: 'Address deleted',
      address: await deleteMarketplaceAddress(args),
    }),
    addToCart: async (_: unknown, args: { input: Parameters<typeof addToCart>[0] }, ctx: unknown) => {
      const authedUserId = getContextUserId(ctx);
      if (!authedUserId) {
        return { success: false, cartItem: null, message: 'Unauthorized' };
      }
      if (args.input.userId !== authedUserId) {
        return { success: false, cartItem: null, message: 'Forbidden' };
      }
      return addToCart({ ...args.input, userId: authedUserId });
    },
    updateCartItem: async (_: unknown, args: { input: Parameters<typeof updateCartItem>[0] }, ctx: unknown) => {
      const authedUserId = getContextUserId(ctx);
      if (!authedUserId) {
        return { success: false, cartItem: null, message: 'Unauthorized' };
      }

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
      const authedUserId = getContextUserId(ctx);
      if (!authedUserId) {
        return { success: false, cartItem: null, message: 'Unauthorized' };
      }

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
      ctx: unknown
    ) => {
      const authedUserId = getContextUserId(ctx);
      if (!authedUserId) {
        return { success: false, cartItem: null, message: 'Unauthorized' };
      }
      if (args.userId !== authedUserId) {
        return { success: false, cartItem: null, message: 'Forbidden' };
      }
      return clearCart(authedUserId, {
        trackAbandonment: args.trackAbandonment !== false,
      });
    },
    addUserActivity: async (_: unknown, args: { input: Parameters<typeof addUserActivity>[0] }, ctx: unknown) => {
      const authedUserId = getContextUserId(ctx);
      if (!authedUserId) {
        return { success: false, activity: null, message: 'Unauthorized' };
      }
      if (args.input.userId !== authedUserId) {
        return { success: false, activity: null, message: 'Forbidden' };
      }
      return addUserActivity({ ...args.input, userId: authedUserId });
    },
    deleteUserActivity: (_: unknown, args: Parameters<typeof deleteUserActivity>[0]) => deleteUserActivity(args),
    addSearchHistory: (_: unknown, args: Parameters<typeof addSearchHistory>[0]) => addSearchHistory(args),
    removeSearchHistory: (_: unknown, args: Parameters<typeof removeSearchHistory>[0]) => removeSearchHistory(args),
    clearSearchHistory: (_: unknown, args: Parameters<typeof clearSearchHistory>[0]) => clearSearchHistory(args),
  },
};

