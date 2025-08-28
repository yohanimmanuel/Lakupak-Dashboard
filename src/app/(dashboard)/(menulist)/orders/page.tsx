'use client';
import React, { useState } from 'react';
import { Download } from 'lucide-react';
import OrdersCards from '@/components/ordershipment/OrdersCards';
import OrdersGPS from '@/components/ordershipment/OrdersGPS';
import OrdersTable from '@/components/ordershipment/OrdersTable';
import { Order, OrderTableRow } from '@/types/order';
import * as XLSX from 'xlsx';

// Mock data for development
const mockOrders: Order[] = [
  {
    id: '1',
    orderId: 'LKO-12345678',
    buyerId: 'BUY001',
    orderDate: new Date('2024-01-15'),
    orderStatus: 'Pending',
    paymentStatus: 'Unpaid',
    deliveryMethod: 'Distributor Fleet',
    orderItems: [
      { productId: 'PROD001', productName: 'Premium Rice 25kg', quantity: 10, unitPrice: 25, subtotal: 250 },
      { productId: 'PROD002', productName: 'Cooking Oil 2L', quantity: 20, unitPrice: 8, subtotal: 160 }
    ],
    subtotal: 410,
    discounts: 20,
    taxes: 0,
    shippingFee: 15,
    totalAmount: 405,
    paymentTerms: 'Net 30',
    deliveryAddress: 'Jl. Sudirman No. 123, Jakarta Pusat',
    contactPerson: 'John Doe',
    contactPhone: '+62-812-3456-7890',
    preferredDeliveryTime: '09:00-17:00',
    assignedLogistics: 'Fleet A',
    trackingNumber: 'TRK001',
    deliveryNoteNo: 'DO001',
    createdAt: new Date('2024-01-15T08:00:00Z'),
    updatedAt: new Date('2024-01-15T08:00:00Z')
  },
  {
    id: '2',
    orderId: 'LKO-87654321',
    buyerId: 'BUY002',
    orderDate: new Date('2024-01-16'),
    orderStatus: 'Confirmed',
    paymentStatus: 'Paid',
    deliveryMethod: '3rd-Party Courier',
    orderItems: [
      { productId: 'PROD003', productName: 'Sugar 1kg', quantity: 50, unitPrice: 3, subtotal: 150 },
      { productId: 'PROD004', productName: 'Flour 1kg', quantity: 30, unitPrice: 4, subtotal: 120 }
    ],
    subtotal: 270,
    discounts: 0,
    taxes: 0,
    shippingFee: 10,
    totalAmount: 280,
    paymentTerms: 'Cash on Delivery',
    deliveryAddress: 'Jl. Thamrin No. 456, Jakarta Selatan',
    contactPerson: 'Jane Smith',
    contactPhone: '+62-813-9876-5432',
    preferredDeliveryTime: '10:00-18:00',
    assignedLogistics: 'Courier Express',
    trackingNumber: 'TRK002',
    deliveryNoteNo: 'DO002',
    createdAt: new Date('2024-01-16T09:00:00Z'),
    updatedAt: new Date('2024-01-16T10:00:00Z'),
    acceptedBy: 'Staff001',
    acceptedAt: new Date('2024-01-16T10:00:00Z')
  },
  {
    id: '3',
    orderId: 'LKO-11223344',
    buyerId: 'BUY003',
    orderDate: new Date('2024-01-17'),
    orderStatus: 'Shipped',
    paymentStatus: 'Paid',
    deliveryMethod: 'Distributor Fleet',
    orderItems: [
      { productId: 'PROD005', productName: 'Instant Noodles', quantity: 100, unitPrice: 2, subtotal: 200 }
    ],
    subtotal: 200,
    discounts: 10,
    taxes: 0,
    shippingFee: 0,
    totalAmount: 190,
    paymentTerms: 'Bank Transfer',
    deliveryAddress: 'Jl. Gatot Subroto No. 789, Jakarta Barat',
    contactPerson: 'Bob Johnson',
    contactPhone: '+62-814-1111-2222',
    preferredDeliveryTime: '08:00-16:00',
    assignedLogistics: 'Fleet B',
    trackingNumber: 'TRK003',
    deliveryNoteNo: 'DO003',
    createdAt: new Date('2024-01-17T07:00:00Z'),
    updatedAt: new Date('2024-01-17T14:00:00Z'),
    acceptedBy: 'Staff002',
    acceptedAt: new Date('2024-01-17T08:00:00Z')
  },
  {
    id: '4',
    orderId: 'LKO-55667788',
    buyerId: 'BUY004',
    orderDate: new Date('2024-01-18'),
    orderStatus: 'Delivered',
    paymentStatus: 'Paid',
    deliveryMethod: 'Pickup',
    orderItems: [
      { productId: 'PROD006', productName: 'Bottled Water 600ml', quantity: 200, unitPrice: 1, subtotal: 200 },
      { productId: 'PROD007', productName: 'Tea Bags 100pcs', quantity: 10, unitPrice: 5, subtotal: 50 }
    ],
    subtotal: 250,
    discounts: 0,
    taxes: 0,
    shippingFee: 0,
    totalAmount: 250,
    paymentTerms: 'Cash on Delivery',
    deliveryAddress: 'Warehouse A, Jakarta Utara',
    contactPerson: 'Alice Brown',
    contactPhone: '+62-815-3333-4444',
    preferredDeliveryTime: '09:00-17:00',
    assignedLogistics: 'Self Pickup',
    trackingNumber: 'N/A',
    deliveryNoteNo: 'DO004',
    createdAt: new Date('2024-01-18T06:00:00Z'),
    updatedAt: new Date('2024-01-18T16:00:00Z'),
    acceptedBy: 'Staff003',
    acceptedAt: new Date('2024-01-18T07:00:00Z'),
    deliveryConfirmation: 'Delivered successfully',
    pod: 'POD004'
  }
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>(mockOrders);

  const orderToTableRow = (order: Order): OrderTableRow => ({
    id: order.id,
    orderId: order.orderId,
    buyerId: order.buyerId,
    buyerName: order.contactPerson,
    orderDate: order.orderDate.toISOString(),
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    totalAmount: order.totalAmount.toString(),
    items: `${order.orderItems.length} items`,
    deliveryMethod: order.deliveryMethod,
    trackingNumber: order.trackingNumber,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString()
  });

  const handleExportXLSX = (workbook: XLSX.WorkBook, filename: string) => {
    XLSX.writeFile(workbook, filename);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="w-full mx-auto">
        {/* Header Section */}
        <div className="mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Orders Management</h1>
              <p className="text-sm text-gray-600 mt-2">
                Track and manage all your B2B marketplace orders
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleExportXLSX(
                  XLSX.utils.book_new(),
                  `orders_${new Date().toISOString().split('T')[0]}.xlsx`
                )}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#0a61d7] rounded-lg hover:bg-[#0851b8] transition-colors"
              >
                <Download className="w-4 h-4" />
                Export Data
              </button>
            </div>
          </div>
        </div>

        {/* Orders GPS and Cards Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* GPS Map - Left Side */}
          <div className="lg:col-span-2">
            <OrdersGPS orders={orders} />
          </div>
          
          {/* Stat Cards - Right Side */}
          <div>
            <OrdersCards orders={orders} />
          </div>
        </div>

        {/* Orders Table Section */}
        <OrdersTable
          orders={orders}
          setOrders={setOrders}
          onExportXLSX={handleExportXLSX}
          orderToTableRow={orderToTableRow}
        />
      </div>
    </div>
  );
}
