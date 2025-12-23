import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { baseTypeDefs, baseResolvers } from './modules/common/schema';
import { mergeTypeDefs } from './modules/common/mergeTypeDefs';
import { mergeResolvers } from './modules/common/mergeResolvers';

import { productsTypeDefs, productsResolvers } from './modules/products';
import { offersTypeDefs, offersResolvers } from './modules/offers';
import { ordersTypeDefs, ordersResolvers } from './modules/orders';
import { contactsTypeDefs, contactsResolvers } from './modules/contacts';
import { dashboardTypeDefs, dashboardResolvers } from './modules/dashboard';
import { userActivityTypeDefs, userActivityResolvers } from './modules/userActivity';
import { marketplaceTypeDefs, marketplaceResolvers } from './modules/marketplace';
import { salesTypeDefs, salesResolvers } from './modules/sales';

const typeDefs = mergeTypeDefs([
  baseTypeDefs,
  productsTypeDefs,
  offersTypeDefs,
  ordersTypeDefs,
  contactsTypeDefs,
  dashboardTypeDefs,
  userActivityTypeDefs,
  marketplaceTypeDefs,
  salesTypeDefs,
]);

const resolvers = mergeResolvers([
  baseResolvers,
  productsResolvers,
  offersResolvers,
  ordersResolvers,
  contactsResolvers,
  dashboardResolvers,
  userActivityResolvers,
  marketplaceResolvers,
  salesResolvers,
]);

const server = new ApolloServer({
  typeDefs,
  resolvers: resolvers as never,
  formatError: (error) => {
    // Handle JSON parsing errors
    if (error.message.includes('JSON') || error.message.includes('Unexpected end') || error.message.includes('Unexpected token')) {
      return {
        message: 'Invalid or empty request body',
        extensions: { code: 'BAD_REQUEST' },
      };
    }
    return error;
  },
});

const apolloHandler = startServerAndCreateNextHandler<NextRequest>(server);

// Wrapper to handle errors that might escape Apollo Server
async function handler(request: NextRequest) {
  try {
    return await apolloHandler(request);
  } catch (error) {
    // Handle JSON parsing errors that escape Apollo Server
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      error instanceof SyntaxError ||
      errorMessage.includes('JSON') ||
      errorMessage.includes('Unexpected end') ||
      errorMessage.includes('Unexpected token')
    ) {
      return NextResponse.json(
        { errors: [{ message: 'Invalid or empty request body' }] },
        { status: 400 }
      );
    }
    // Re-throw other errors
    throw error;
  }
}

export { handler as GET, handler as POST };

