import { PrismaClient } from '@/generated/prisma';

const prisma = new PrismaClient();

export async function syncOrderToBuyerProfile(buyerId: string, userId: number) {
  try {
    // Get buyer
    const buyer = await prisma.buyer.findUnique({
      where: { buyerId }
    });

    if (!buyer) {
      return;
    }

    // Get all orders for this buyer (excluding cancelled and returned)
    const orders = await prisma.order.findMany({
      where: {
        buyerId: buyerId,
        orderStatus: { notIn: ['Cancelled', 'Returned'] } // Exclude cancelled and returned orders
      },
      include: {
        orderItemsRel: true
      }
    });

    // Calculate totals
    let totalSpend = 0;
    let totalOutstanding = 0;
    let orderCount = 0;
    const monthlyData: { [key: string]: { spend: number; orders: number } } = {};

    for (const order of orders) {
      const orderSpend = order.orderItemsRel.reduce((sum: number, item: { subtotal: number }) => sum + item.subtotal, 0);
      const totalOrderAmount = orderSpend + (order.shippingFee || 0);
      
      totalSpend += totalOrderAmount;
      orderCount++;

      // Outstanding calculation (only for pending/unpaid orders)
      if (order.paymentStatus === 'Pending' || order.paymentStatus === 'Unpaid') {
        totalOutstanding += totalOrderAmount;
      }

      // Monthly data
      const monthKey = order.createdAt.toISOString().substring(0, 7); // YYYY-MM
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { spend: 0, orders: 0 };
      }
      monthlyData[monthKey].spend += totalOrderAmount;
      monthlyData[monthKey].orders += 1;
    }

    // Calculate monthly averages
    const monthlyAverages = Object.entries(monthlyData).map(([month, data]) => ({
      month,
      totalSpend: data.spend,
      orderCount: data.orders
    }));

    // Process orders into orderDetails format for the buyer profile
    const orderDetails = orders.map(order => {
      const productNames = order.orderItemsRel.map(item => 
        item.productNameSnapshot || 'Unknown Product'
      ).join(', ');
      
      const totalOrders = order.orderItemsRel.reduce((sum: number, item: { packageQuantity: number | null }) => sum + (item.packageQuantity ?? 1), 0);
      const orderSpend = order.orderItemsRel.reduce((sum: number, item: { subtotal: number }) => sum + item.subtotal, 0);
      const orderTotal = orderSpend + (order.shippingFee || 0);
      const orderOutstanding = (order.paymentStatus === 'Pending' || order.paymentStatus === 'Unpaid') ? orderTotal : 0;
      
      return {
        orderNo: order.orderId,
        product: productNames,
        totalOrders: totalOrders.toString(),
        totalSpend: orderTotal.toString(),
        shippingFee: (order.shippingFee || 0).toString(),
        lastOrderDate: order.createdAt.toISOString().split('T')[0],
        outstanding: orderOutstanding.toString()
      };
    });

    // Update buyer with synced order details
    await prisma.buyer.update({
      where: { buyerId },
      data: {
        orderDetails: JSON.stringify(orderDetails),
        updatedAt: new Date()
      }
    });

  } catch (error) {
  }
}
