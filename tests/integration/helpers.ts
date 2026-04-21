import { prisma } from '@/lib/db';

export async function resetDb() {
  // Order matters because of FKs.
  await prisma.userActivity.deleteMany();
  await prisma.searchHistory.deleteMany();
  await prisma.address.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.variantOption.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.marketplaceUser.deleteMany();
  await prisma.user.deleteMany();
}

