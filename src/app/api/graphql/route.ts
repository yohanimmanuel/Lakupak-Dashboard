import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import type { NextRequest } from 'next/server';

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

const typeDefs = mergeTypeDefs([
  baseTypeDefs,
  productsTypeDefs,
  offersTypeDefs,
  ordersTypeDefs,
  contactsTypeDefs,
  dashboardTypeDefs,
  userActivityTypeDefs,
  marketplaceTypeDefs,
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
]);

const server = new ApolloServer({
  typeDefs,
  resolvers: resolvers as never,
});

const handler = startServerAndCreateNextHandler<NextRequest>(server);

export { handler as GET, handler as POST };

