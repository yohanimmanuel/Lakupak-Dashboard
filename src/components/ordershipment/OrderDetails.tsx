'use client';
import React, { useState } from 'react';
import { ArrowLeft, MapPin, Star, Package, DollarSign, Truck, CheckCircle, Clock, User, X, ChevronDown, Pencil } from 'lucide-react';
import { Order } from '@/types/order';
import { useUserStore } from '@/store/userStore';
import { calculateOrderSubtotal, calculateOrderTotalAmount, calculateOrderTotalQuantity } from '@/utils/orderUtils';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';

interface OrderDetailsProps {
  order: Order;
  onBack: () => void;
}

export default function OrderDetails({ order, onBack }: OrderDetailsProps) {
  const user = useUserStore(state => state.user);
  const [showAllItems, setShowAllItems] = useState(false);
  const [earningsPage, setEarningsPage] = useState(1);
  const [orderStatus, setOrderStatus] = useState<string>(order.orderStatus);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  type DeliveryMethod = Order['deliveryMethod'];
  const [formFields, setFormFields] = useState({
    deliveryAddress: order.deliveryAddress,
    contactPerson: order.contactPerson,
    contactPhone: order.contactPhone,
    preferredDeliveryTime: order.preferredDeliveryTime || '',
    deliveryNote: order.deliveryNote || '',
    assignedLogistics: order.assignedLogistics || '',
    trackingNumber: order.trackingNumber || '',
    deliveryMethod: order.deliveryMethod as DeliveryMethod,
    pod: (order as any).pod || ''
  });
  const [podFileName, setPodFileName] = useState<string>('');
   
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return 'bg-yellow-100 text-yellow-800 font-semibold';
      case 'Confirmed': return 'bg-blue-100 text-blue-800 font-semibold';
      case 'Packed': return 'bg-purple-100 text-purple-800 font-semibold';
      case 'Shipped': return 'bg-indigo-100 text-indigo-800 font-semibold';
      case 'Delivered': return 'bg-green-100 text-green-800 font-semibold';
      case 'Cancelled': return 'bg-red-100 text-red-800 font-semibold';
      case 'Returned': return 'bg-orange-100 text-orange-800 font-semibold';
      default: return 'bg-gray-100 text-gray-800 font-semibold';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'Paid': return 'bg-green-100 text-green-800 font-semibold';
      case 'Unpaid': return 'bg-red-100 text-red-800 font-semibold';
      default: return 'bg-gray-100 text-gray-800 font-semibold';
    }
  };

  const calculateSubtotal = () => calculateOrderSubtotal(order);
  const calculateTotalAmount = () => calculateOrderTotalAmount(order);
  const calculateTotalQuantity = () => calculateOrderTotalQuantity(order);



  // Calculate pagination for earnings table
  const earningsPerPage = 4;
  const totalEarningsPages = Math.ceil(order.orderItems.length / earningsPerPage);
  const startIndex = (earningsPage - 1) * earningsPerPage;
  const endIndex = startIndex + earningsPerPage;
  const currentEarningsItems = order.orderItems.slice(startIndex, endIndex);

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <div className="w-full mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />   
            <span className="text-xl font-semibold">Back to Order Lists</span>
          </button>
          
          {/* Status Buttons - Top Right */}
          <div className="flex gap-2">
            {/* Order Status Dropdown */}
            <div className="relative group">
              <button
                className={`flex items-center gap-1 py-2 px-4 rounded-lg text-sm font-medium min-w-[120px] ${getStatusColor(orderStatus)} hover:opacity-80 transition-all duration-200`}
                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                title="Update your order or shipment status here"
              >
                {orderStatus}
                <ChevronDown className="w-4 h-4 ml-3 text-gray-500" />
              </button>
              
              {/* Hover tooltip */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                Update your order or shipment status here
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
              </div>
              
              {/* Dropdown Menu */}
              {showStatusDropdown && (
                <div className="absolute right-0 mt-2 w-32 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                  {['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Returned'].map(status => (
                    <button
                      key={status}
                      onClick={async () => {
                        try {
                          const requestBody: Record<string, unknown> = {
                            orderId: order.orderId,
                            orderStatus: status
                          };
                          
                          // Add userId if user is authenticated
                          if (user?.id) {
                            requestBody.userId = user.id;
                          }

                          const response = await fetch('/api/orders', {
                            method: 'PUT',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(requestBody),
                          });
                          
                          
                          if (!response.ok) {
                            const errorText = await response.text();
                            throw new Error(`Failed to update order status: ${response.status}`);
                          }
                          
                          const result = await response.json();
                          
                          setOrderStatus(status);
                          setShowStatusDropdown(false);
                        } catch (error) {
                        }
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg ${
                        orderStatus === status ? 'font-bold text-[#0a61d7] bg-blue-50' : 'text-gray-700'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Payment Status (Read-only, managed by mobile app) */}
            <button className={`py-2 px-4 rounded-lg text-sm font-medium min-w-[120px] ${getPaymentStatusColor(order.paymentStatus)}`}>
              {order.paymentStatus}
            </button>
            
            {/* Edit Button */}
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-2 py-2 px-4 rounded-lg text-sm text-black font-medium border border-gray-300 hover:bg-gray-50"
              title="Edit order delivery and contact details"
            >
              <Pencil className="w-4 h-4" /> Edit
            </button>

          </div>
        </div>

                {/* Row 1: Full Width Customer Information */}
        <div className="w-full mb-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-md font-semibold text-black mb-4">Customer Information</h2>
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-[#0a61d7] rounded-full flex items-center justify-center text-white text-xl font-bold">
                <User className="w-8 h-8" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">
                  {order.contactPerson}
                  <span
                    className="ml-2 text-[#0a61d7] text-sm font-semibold cursor-pointer hover:text-blue-800"
                    title="View buyer profile"
                    onClick={() => window.location.href = `/clients/buyers/details/${order.buyerId}`}
                  >
                    ({order.buyerId})
                  </span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 text-xs">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-600">Store Name:</span>
                      <span className="text-black font-medium">{order.storeName}</span>
                    </div>
                    <div className='flex items-center justify-between gap-2'>
                      <span className="text-gray-600">Phone:</span>
                      <span className="text-black font-medium">{order.contactPhone}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className='flex items-center justify-between gap-2'>
                      <span className="text-gray-600">Email:</span>
                      <span className="text-black font-medium">{order.customerEmail || 'N/A'}</span>
                    </div>
                    <div className='flex items-center justify-between gap-2'>
                      <span className="text-gray-600">Order Date:</span>
                      <span className="text-black font-medium">{order.orderDate.toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Total Order and Delivery Service side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          
          {/* Total Order Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            {/* Total Order Header */}
            <div>
              <div className="text-md font-semibold text-black mb-2">Total Order</div>
              <div className="text-2xl font-bold text-[#0a61d7] mb-3">{formatCurrency(calculateTotalAmount(), user?.currency)}</div>
            </div>

            {/* Payment Authorization Card */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-black">BANK</div>
                  <div className="text-sm text-gray-600">Transfer</div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${getPaymentStatusColor(order.paymentStatus)}`}>
                  {order.paymentStatus.toUpperCase()}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                Payment processed successfully. This transaction has been authorized for future reference.
              </div>
            </div>

            {/* Order Details List */}
            <div>
              <div className="text-sm font-semibold text-gray-500 mb-3">Order Details</div>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">Service price:</span>
                  <span className="font-medium text-black">{formatCurrency(calculateSubtotal(), user?.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Discounts:</span>
                  <span className="font-medium text-green-600">{formatCurrency(order.discounts, user?.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Taxes:</span>
                  <span className="font-medium text-black">{formatCurrency(order.taxes, user?.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Shipping fee:</span>
                  <span className="font-medium text-black">{formatCurrency(order.shippingFee, user?.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Currency:</span>
                  <span className="font-medium text-black">{user?.currency || getDefaultCurrency()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Payment Terms:</span>
                  <span className="text-black font-medium">{order.paymentTerms}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Delivery Method:</span>
                  <span className="text-black font-medium">{order.deliveryMethod}</span>
                </div>
              </div>
            </div>

            {/* Service Provider Card */}
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 mt-4">
              <div className="text-sm font-semibold text-blue-800 mb-1">Delivery Service</div>
              <div className="text-lg font-bold text-blue-900 mb-2">{order.assignedLogistics || 'N/A'}</div>
              <div className="text-xs space-y-2">
                <div>
                  <span className="text-blue-700">Preferred Time:</span>
                  <span className="ml-2 font-medium text-blue-900">{order.preferredDeliveryTime || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-blue-700">Tracking:</span>
                  <span className="ml-2 font-semibold text-blue-900">{order.trackingNumber || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Delivery Service Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-md font-semibold text-black mb-4">Updates and Status</h2>
            
            {/* GPS Placeholder */}
            <div className="bg-gray-100 rounded-lg h-80 flex items-center justify-center mb-4">
              <div className="text-center">
                <MapPin className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">GPS Map</p>
                <p className="text-xs text-gray-400">Location tracking</p>
              </div>
            </div>

            {/* Store & Address */}
            <div className="mb-4 border-b border-gray-200 pb-4 mb-4">
              <span className="font-semibold text-sm text-black">{order.storeName}</span>
              <p className="text-xs font-medium text-gray-600 mt-1">{order.deliveryAddress}</p>
              <p className="text-xs font-medium text-gray-600 mt-1 italic">Note: {order.deliveryNote}</p>
            </div>

            {/* Rating Section */}
            <div className="text-xs text-gray-600">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span>The shop's rating is</span>
                <span className="text-3xl font-semibold text-black">4.8</span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-2">
                <span className="text-xs text-gray-600">Based on 23 reviews</span>
                <div className="flex items-center">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-4 h-4 ${
                        star <= 4 ? 'text-yellow-500 fill-current' : 'text-gray-300'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Order Items and Earnings Breakdown side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          
          {/* Order Items Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-md font-semibold text-black mb-4">Order Items</h2>
            <div className="space-y-2">
              {order.orderItems.slice(0, 4).map((item, index) => (
                <div key={index} className="flex items-center gap-3 p-3">
                  {/* Image Placeholder */}
                  <div className="w-14 h-14 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Package className="w-6 h-6 text-gray-400" />
                  </div>
                  
                  {/* Item Details */}
                  <div className="flex-1">
                    <h3 
                      className="text-sm font-semibold text-[#0a61d7] hover:text-blue-800 cursor-pointer transition-colors"
                      onClick={() => {
                        const href = item.productId ? `/products/catalog/${item.productId}` : `/products/deleted?id=${item.productSkuSnapshot || ''}`;
                        window.location.href = href;
                      }}
                      title="Click to view product details"
                    >
                      {item.productName}
                    </h3>
                    <p className="text-xs text-gray-600">SKU: {item.productId || item.productSkuSnapshot}</p>
                    <p className="text-xs text-gray-600">Category: {item.category || 'Uncategorized'}</p>
                  </div>
                  
                  {/* Price & Quantity */}
                  <div className="text-right">
                    <p className="text-xs text-gray-600 mb-1">Qty: {item.quantity}</p>
                    <p className="text-xs font-medium text-gray-900">{formatCurrency(item.unitPrice, user?.currency)}</p>
                    <p className="text-sm font-semibold text-black">{formatCurrency(item.subtotal, user?.currency)}</p>
                  </div>
                </div>
              ))}
              
              {/* See More Button */}
              {order.orderItems && order.orderItems.length > 4 && (
                <div className="pt-2">
                  <button
                    onClick={() => setShowAllItems(true)}
                    className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    See More ({order.orderItems.length - 4} more items)
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Order Summary Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-md font-semibold text-black mb-4">Order Summary</h2>
            
            {/* Top Summary Cards */}
            <div className="grid grid-cols-1 gap-4 mb-6">
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="text-2xl font-bold text-green-600">{calculateTotalQuantity()}</div>
                <div className="text-sm text-gray-600">Total Items Quantity</div>
              </div>
            </div>

            {/* Detailed Breakdown Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="text-left py-2 font-medium uppercase">Description</th>
                    <th className="text-left py-2 font-medium uppercase">Price</th>
                    <th className="text-left py-2 font-medium uppercase">Quantity</th>
                    <th className="text-right py-2 font-medium uppercase">Total Amount</th>
                    </tr>
                </thead>
                <tbody className="text-black">
                  {currentEarningsItems.map((item, index) => (
                    <tr key={index} className="border-b border-gray-100">
                      <td className="py-2">
                        <span 
                          className="font-semibold text-[#0a61d7] hover:text-blue-800 cursor-pointer transition-colors"
                          onClick={() => {
                            const href = item.productId ? `/products/catalog/${item.productId}` : `/products/deleted?id=${item.productSkuSnapshot || ''}`;
                            window.location.href = href;
                          }}
                          title="Click to view product details"
                        >
                          {item.productName}
                        </span>
                      </td>
                      <td className="py-2">{formatCurrency(item.unitPrice, user?.currency)}</td>
                      <td className="py-2">{item.quantity}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(item.subtotal, user?.currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300">
                    <td colSpan={3} className="py-3 text-lg font-semibold text-gray-900">Total price</td>
                    <td className="py-3 text-right font-bold text-lg text-gray-900">
                      {formatCurrency(calculateSubtotal(), user?.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

                          {/* Pagination Controls */}
              {totalEarningsPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-4">
                  <button
                    onClick={() => setEarningsPage(prev => Math.max(1, prev - 1))}
                    disabled={earningsPage === 1}
                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {earningsPage} of {totalEarningsPages}
                  </span>
                  <button
                    onClick={() => setEarningsPage(prev => Math.min(totalEarningsPages, prev + 1))}
                    disabled={earningsPage === totalEarningsPages}
                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
          </div>
        </div>
      </div>
      
      {/* All Items Modal */}
      {showAllItems && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">All Order Items</h2>
              <button
                onClick={() => setShowAllItems(false)}
                className="text-gray-700 hover:bg-gray-200 rounded-lg p-2 transition-colors"
              >
                <X className="w-6 h-6"/>
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="p-4 overflow-y-auto max-h-[80vh] hide-scrollbar">
              <div className="space-y-3">
                {order.orderItems.map((item, index) => (
                  <div key={index} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                    {/* Image Placeholder */}
                    <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Package className="w-8 h-8 text-gray-400" />
                    </div>
                    
                    {/* Item Details */}
                    <div className="flex-1">
                      <h3 
                        className="text-base font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors"
                        onClick={() => window.location.href = `/products/catalog/${item.productId}`}
                        title="Click to view product details"
                      >
                        {item.productName}
                      </h3>
                      <p className="text-sm text-gray-600">SKU: {item.productId}</p>
                      <p className="text-sm text-gray-600">Category: {item.category || 'Uncategorized'}</p>
                    </div>
                    
                    {/* Price & Quantity */}
                    <div className="text-right">
                      <p className="text-sm text-gray-600 mb-1">Qty: {item.quantity}</p>
                      <p className="text-sm font-medium text-gray-900">{formatCurrency(item.unitPrice, user?.currency)}</p>
                      <p className="text-lg font-semibold text-[#0a61d7]">{formatCurrency(item.subtotal, user?.currency)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Order Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Edit Order</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-700 hover:bg-gray-200 rounded-lg p-2 transition-colors"
                aria-label="Close edit order"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[70vh]">
              <p className="p-4 bg-orange-50 rounded-lg border border-orange-200 text-xs text-orange-600 mb-3 italic">
                *Please complete these order details. Updates here will be shared with buyers so they receive the latest delivery and contact information.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500">Contact Person</label>
                  <input
                    className="w-full mt-1 px-3 py-2 text-xs text-black border border-gray-300 rounded-lg"
                    placeholder="e.g. Store owner or PIC name"
                    value={formFields.contactPerson}
                    onChange={(e) => setFormFields({ ...formFields, contactPerson: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Contact Phone</label>
                  <input
                    className="w-full mt-1 px-3 py-2 text-xs text-black border border-gray-300 rounded-lg"
                    placeholder="e.g. 0812-3456-7890"
                    value={formFields.contactPhone}
                    onChange={(e) => setFormFields({ ...formFields, contactPhone: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-500">Delivery Address</label>
                  <input
                    className="w-full mt-1 px-3 py-2 text-xs text-black border border-gray-300 rounded-lg"
                    placeholder="Street, City, Province, Postal Code"
                    value={formFields.deliveryAddress}
                    onChange={(e) => setFormFields({ ...formFields, deliveryAddress: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Preferred Delivery Time</label>
                  <input
                    className="w-full mt-1 px-3 py-2 text-xs text-black border border-gray-300 rounded-lg"
                    placeholder="e.g. 09:00 - 12:00"
                    value={formFields.preferredDeliveryTime}
                    onChange={(e) => setFormFields({ ...formFields, preferredDeliveryTime: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Delivery Method</label>
                  <select
                    className="w-full mt-1 px-3 py-2 text-xs text-black border border-gray-300 rounded-lg"
                    value={formFields.deliveryMethod}
                    onChange={(e) => setFormFields({ ...formFields, deliveryMethod: e.target.value as DeliveryMethod })}
                  >
                    <option value="Distributor Fleet">Distributor Fleet</option>
                    <option value="3rd-Party Courier">3rd-Party Courier</option>
                    <option value="Pickup">Pickup</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Assigned Logistics</label>
                  <input
                    className="w-full mt-1 px-3 py-2 text-xs text-black border border-gray-300 rounded-lg"
                    placeholder="e.g. JNE / Internal Fleet / Vendor name"
                    value={formFields.assignedLogistics}
                    onChange={(e) => setFormFields({ ...formFields, assignedLogistics: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Tracking Number</label>
                  <input
                    className="w-full mt-1 px-3 py-2 text-xs text-black border border-gray-300 rounded-lg"
                    placeholder="e.g. 1Z999AA10123456784"
                    value={formFields.trackingNumber}
                    onChange={(e) => setFormFields({ ...formFields, trackingNumber: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-500">Delivery Note</label>
                  <textarea
                    className="w-full mt-1 px-3 py-2 text-xs text-black border border-gray-300 rounded-lg"
                    rows={3}
                    placeholder="Notes for driver or warehouse (e.g. fragile, gate access)"
                    value={formFields.deliveryNote}
                    onChange={(e) => setFormFields({ ...formFields, deliveryNote: e.target.value })}
                  />
                </div>
                {orderStatus === 'Delivered' && (
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-500">Proof of Delivery (POD)</label>
                    <div className="mt-1 flex items-center gap-3">
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="text-xs"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setPodFileName(file.name);
                          const reader = new FileReader();
                          reader.onload = () => {
                            setFormFields({ ...formFields, pod: String(reader.result || '') });
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                      {podFileName && <span className="text-xs text-gray-600">{podFileName}</span>}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">Accepted: JPG, PNG, PDF.</p>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-black border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const requestBody: Record<string, unknown> = {
                    orderId: order.orderId,
                    deliveryAddress: formFields.deliveryAddress,
                    contactPerson: formFields.contactPerson,
                    contactPhone: formFields.contactPhone,
                    preferredDeliveryTime: formFields.preferredDeliveryTime,
                    deliveryNote: formFields.deliveryNote,
                    assignedLogistics: formFields.assignedLogistics,
                    trackingNumber: formFields.trackingNumber,
                    deliveryMethod: formFields.deliveryMethod
                  };
                  if (orderStatus === 'Delivered' && formFields.pod) {
                    requestBody.pod = formFields.pod;
                    requestBody.deliveryConfirmation = 'delivered';
                  }
                  if (user?.id) requestBody.userId = user.id;
                  const response = await fetch('/api/orders', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                  });
                  if (response.ok) {
                    setShowEditModal(false);
                    // Optional: refresh to reflect edits
                    window.location.reload();
                  }
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#0a61d7] hover:bg-[#084ba6]"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
