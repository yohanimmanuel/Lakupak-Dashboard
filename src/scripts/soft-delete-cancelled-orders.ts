import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

/**
 * Soft delete cancelled orders that are older than 1 minute
 * This script should be run frequently via cron job
 */
async function softDeleteCancelledOrders() {
  try {
    
    // Calculate date 1 minute ago
    const oneMinuteAgo = new Date();
    oneMinuteAgo.setMinutes(oneMinuteAgo.getMinutes() - 1);
    
    // Find cancelled orders older than 1 minute that are not already soft deleted
    const cancelledOrders = await prisma.order.findMany({
      where: {
        orderStatus: 'Cancelled',
        cancelledAt: {
          lte: oneMinuteAgo
        },
        isDeleted: false
      },
      select: {
        id: true,
        orderId: true,
        cancelledAt: true,
        orderStatus: true
      }
    });
    
    if (cancelledOrders.length === 0) {
      return;
    }
    
    // Soft delete the orders
    const result = await prisma.order.updateMany({
      where: {
        orderStatus: 'Cancelled',
        cancelledAt: {
          lte: oneMinuteAgo
        },
        isDeleted: false
      },
      data: {
        isDeleted: true
      }
    });
    
    
  } catch (error) {
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script if called directly
if (require.main === module) {
  softDeleteCancelledOrders()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      process.exit(1);
    });
}

export { softDeleteCancelledOrders };
