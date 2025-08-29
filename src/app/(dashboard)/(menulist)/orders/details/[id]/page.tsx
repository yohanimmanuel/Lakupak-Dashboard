'use client';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import OrderDetails from '@/components/ordershipment/OrderDetails';
import { Order } from '@/types/order';

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const orderIdParam = params.id as string; // This will be the full orderId like "LKO-12345678"

  // Mock order data - replace with actual API call
  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      const mockOrder: Order = {
        // ===== IMPORTANT: STORAGE STRATEGY =====
        // All calculated financial values MUST be stored in the database for:
        // 1. Data consistency across sessions
        // 2. Financial reporting and auditing
        // 3. Business intelligence and analytics
        // 4. Compliance and regulatory requirements
        // 5. Historical data preservation
        //
        // When implementing the backend, ensure these fields are persisted:
        // - subtotal: Calculated from orderItems
        // - totalAmount: Calculated from subtotal + taxes + shipping - discounts
        // - shopCommission: Calculated as 15% of subtotal
        // - forwarderEarnings: Calculated as 10% of subtotal
        // - platformEarnings: Calculated as 5% of subtotal
        // - totalEarnings: Sum of all commission types
        // ================================================

        // ===== SECTION 1: ORDER DETAILS (Top Left) =====
        id: 'mock-id-1', // Use a mock internal id
        orderId: orderIdParam, // Use the full orderId from URL parameter
        buyerId: 'buyer-001',
        orderDate: new Date('2024-12-25'),
        orderStatus: 'Shipped',
        paymentStatus: 'Paid',
        deliveryMethod: '3rd-Party Courier',
        discounts: 89.50,
        taxes: 89.50,
        shippingFee: 25.00,
        paymentTerms: 'Net 30',
        currency: 'USD',

        // ===== SECTION 2: ORDER ITEMS (Top Right) =====
        orderItems: [
          {
            productId: 'PROD001',
            productName: 'Organic Tea Leaves',
            quantity: 30,
            unitPrice: 18.00,
            subtotal: 540.00
          },
          {
            productId: 'PROD002',
            productName: 'Raw Sugar 1kg',
            quantity: 25,
            unitPrice: 12.00,
            subtotal: 300.00
          },
          {
            productId: 'PROD003',
            productName: 'Premium Coffee Beans',
            quantity: 15,
            unitPrice: 25.00,
            subtotal: 375.00
          },
          {
            productId: 'PROD004',
            productName: 'Natural Honey 500g',
            quantity: 20,
            unitPrice: 8.50,
            subtotal: 170.00
          },
        ],

        // Calculate financial values dynamically
        // Calculate subtotal from order items
        subtotal: (() => {
          const items = [
            { quantity: 30, unitPrice: 18.00, subtotal: 540.00 },
            { quantity: 25, unitPrice: 12.00, subtotal: 300.00 },
            { quantity: 15, unitPrice: 25.00, subtotal: 375.00 },
            { quantity: 20, unitPrice: 8.50, subtotal: 170.00 },
            { quantity: 100, unitPrice: 2.50, subtotal: 250.00 },
            { quantity: 50, unitPrice: 15.00, subtotal: 750.00 }
          ];
          return items.reduce((sum, item) => sum + item.subtotal, 0);
        })(),

        // Calculate total amount including taxes, shipping, and discounts
        totalAmount: (() => {
          const items = [
            { quantity: 30, unitPrice: 18.00, subtotal: 540.00 },
            { quantity: 25, unitPrice: 12.00, subtotal: 300.00 },
            { quantity: 15, unitPrice: 25.00, subtotal: 375.00 },
            { quantity: 20, unitPrice: 8.50, subtotal: 170.00 },
            { quantity: 100, unitPrice: 2.50, subtotal: 250.00 },
            { quantity: 50, unitPrice: 15.00, subtotal: 750.00 }
          ];
          const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
          return subtotal + 89.50 + 25.00 - 89.50; // subtotal + taxes + shipping - discounts
        })(),

        // ===== SECTION 3: EARNINGS BREAKDOWN (Middle) =====
        shopEarnings: (() => {
          const items = [
            { quantity: 30, unitPrice: 18.00, subtotal: 540.00 },
            { quantity: 25, unitPrice: 12.00, subtotal: 300.00 },
            { quantity: 15, unitPrice: 25.00, subtotal: 375.00 },
            { quantity: 20, unitPrice: 8.50, subtotal: 170.00 },
            { quantity: 100, unitPrice: 2.50, subtotal: 250.00 },
            { quantity: 50, unitPrice: 15.00, subtotal: 750.00 }
          ];
          const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
          return subtotal * 0.15; // 15% earnings
        })(),
        totalOrders: (() => {
          const items = [
            { quantity: 30, unitPrice: 18.00, subtotal: 540.00 },
            { quantity: 25, unitPrice: 12.00, subtotal: 300.00 },
            { quantity: 15, unitPrice: 25.00, subtotal: 375.00 },
            { quantity: 20, unitPrice: 8.50, subtotal: 170.00 },
            { quantity: 100, unitPrice: 2.50, subtotal: 250.00 },
            { quantity: 50, unitPrice: 15.00, subtotal: 750.00 }
          ];
          const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
          return subtotal; // Total value of all orders
        })(),

        // ===== SECTION 4: CUSTOMER INFORMATION (Bottom Left) =====
        contactPerson: 'John Doe',
        storeName: 'Warung Aji',
        contactPhone: '+62 812-3456-7890',
        customerEmail: 'john.doe@warungaji.com',

        // ===== SECTION 5: DELIVERY SERVICE (Bottom Right) =====
        deliveryAddress: 'Jl. Sudirman No. 123, Jakarta Pusat, DKI Jakarta 10220',
        preferredDeliveryTime: 'Business Hours (9 AM - 5 PM)',
        assignedLogistics: 'Express Delivery Co.',
        trackingNumber: 'TRK-2024-001234',
        deliveryNote: 'Drop off at the store',
        deliveryConfirmation: 'Delivered to recipient',
        pod: 'POD-2024-001234',

        // ===== AUDIT & LOGS =====
        createdAt: new Date('2024-12-20'),
        updatedAt: new Date('2024-12-25'),
        acceptedBy: 'admin-001',
        acceptedAt: new Date('2024-12-21')
      };
      setOrder(mockOrder);
      setLoading(false);
    }, 1000);
  }, [orderIdParam]);

  const handleBack = () => {
    router.push('/orders');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4">
        <div className="w-full mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0a61d7] mx-auto mb-4"></div>
              <p className="text-gray-600">Loading order details...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4">
        <div className="w-full mx-auto">
          <div className="text-center py-12">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Order Not Found</h2>
            <p className="text-gray-600 mb-4">The order you're looking for doesn't exist.</p>
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors"
            >
              Back to Orders
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="w-full mx-auto">
        <OrderDetails order={order} onBack={handleBack} />
      </div>
    </div>
  );
}
