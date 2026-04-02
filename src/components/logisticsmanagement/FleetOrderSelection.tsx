'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Package, Search, Check, ChevronDown, ChevronLeft, ChevronRight, Grid, List } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';

export interface AssignedOrder {
  orderId: string;
  storeName: string;
  totalAmount: number;
  orderStatus: string;
}

/** Delivery methods where the distributor owns the last-mile leg. */
const SELLER_MANAGED_DELIVERY = new Set(['Seller/Distributor Delivery']);

/** Order from API; fleetId used to block orders already assigned to another fleet. */
interface OrderNode extends AssignedOrder {
  fleetId?: number | null;
  deliveryMethod?: string | null;
}

interface FleetOrderSelectionProps {
  selectedOrders: AssignedOrder[];
  onFormChange: (updates: { assignedOrders: AssignedOrder[] }) => void;
  onTabCompletion: (tabId: 'orders', isComplete: boolean) => void;
  mode: 'create' | 'edit';
  /** When editing, the current fleet id so we don't block orders already in this fleet. */
  currentFleetId?: string | null;
}

const ORDERS_QUERY = `
  query GetOrders($userId: Int!, $page: Int, $limit: Int) {
    orders(userId: $userId, page: $page, limit: $limit) {
      nodes {
        orderId
        storeName
        totalAmount
        orderStatus
        fleetId
        deliveryMethod
      }
      pagination { totalCount }
    }
  }
`;

export default function FleetOrderSelection({
  selectedOrders,
  onFormChange,
  onTabCompletion,
  mode,
  currentFleetId,
}: FleetOrderSelectionProps) {
  const user = useUserStore((s) => s.user);
  const [orders, setOrders] = useState<OrderNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const rowsPerPage = 8;
  const currentFleetIdNum = currentFleetId != null ? parseInt(currentFleetId, 10) : null;

  const fetchOrders = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await fetchGraphQL<{
        orders: { nodes: OrderNode[]; pagination: { totalCount: number } };
      }>(ORDERS_QUERY, {
        userId: user.id,
        page: 1,
        limit: 500,
      });
      setOrders(data.orders?.nodes ?? []);
    } catch (e) {
      console.error('Failed to fetch orders:', e);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Orders tab is complete by default; parent should set tabCompletion.orders: true in initial state
  const filteredOrders = orders.filter(
    (o) =>
      !searchQuery ||
      o.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.storeName ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalPages = Math.ceil(filteredOrders.length / rowsPerPage);
  const startIndex = (page - 1) * rowsPerPage;
  const pagedOrders = filteredOrders.slice(startIndex, startIndex + rowsPerPage);

  const isOrderSelected = (orderId: string) => selectedOrders.some((o) => o.orderId === orderId);

  /** Order is assigned to a different fleet; block selection and show message. */
  const isAssignedToOtherFleet = (order: OrderNode) => {
    if (order.fleetId == null) return false;
    if (mode === 'create') return true;
    return currentFleetIdNum != null && order.fleetId !== currentFleetIdNum;
  };

  /**
   * Buyer-arranged Courier and Self Pickup orders are handled entirely by the
   * buyer — the distributor's fleet is not involved, so block assignment.
   */
  const isBuyerManaged = (order: OrderNode) =>
    order.deliveryMethod != null && !SELLER_MANAGED_DELIVERY.has(order.deliveryMethod);

  const handleAddOrder = (order: OrderNode) => {
    if (isAssignedToOtherFleet(order) || isBuyerManaged(order)) return;
    if (!isOrderSelected(order.orderId)) {
      const next = [...selectedOrders, { orderId: order.orderId, storeName: order.storeName, totalAmount: order.totalAmount, orderStatus: order.orderStatus }];
      onFormChange({ assignedOrders: next });
    }
  };

  const handleRemoveOrder = (orderId: string) => {
    onFormChange({ assignedOrders: selectedOrders.filter((o) => o.orderId !== orderId) });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading orders...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Order Selection</h3>
        <p className="text-sm text-gray-500">Select and assign orders to this fleet</p>
      </div>

      <div className="bg-white border border-[#e6e6e6] rounded-lg p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search orders by ID or store..."
              className="w-full pl-10 pr-4 py-2 text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] text-sm"
            />
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${viewMode === 'grid' ? 'bg-white text-[#0a61d7] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${viewMode === 'list' ? 'bg-white text-[#0a61d7] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {selectedOrders.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-700">
                {selectedOrders.length} order{selectedOrders.length !== 1 ? 's' : ''} assigned
              </span>
              <button
                onClick={() => onFormChange({ assignedOrders: [] })}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear All
              </button>
            </div>
          </div>
        )}
      </div>

      {pagedOrders.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
          <Package className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-sm text-gray-500">No orders found</p>
        </div>
      ) : (
        <>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {pagedOrders.map((order) => {
                const selected    = isOrderSelected(order.orderId);
                const otherFleet  = isAssignedToOtherFleet(order);
                const buyerOwned  = isBuyerManaged(order);
                const blocked     = otherFleet || buyerOwned;
                return (
                  <div
                    key={order.orderId}
                    onClick={() => (blocked ? undefined : selected ? handleRemoveOrder(order.orderId) : handleAddOrder(order))}
                    className={`border-2 rounded-lg p-4 transition-all ${
                      buyerOwned
                        ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-70'
                        : otherFleet
                          ? 'border-amber-300 bg-amber-50/80 cursor-not-allowed opacity-90'
                          : selected
                            ? 'border-green-500 bg-green-50 cursor-pointer'
                            : 'border-[#e6e6e6] hover:border-gray-300 bg-white cursor-pointer'
                    }`}
                    title={
                      buyerOwned  ? `${order.deliveryMethod} — handled by buyer, not assignable to fleet`
                      : otherFleet ? 'Assigned to another fleet'
                      : undefined
                    }
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">{order.orderId}</h4>
                        <p className="text-xs text-gray-500 mt-1">{order.storeName || '—'}</p>
                        <p className="text-sm font-bold text-[#0a61d7] mt-2">
                          IDR {Number(order.totalAmount ?? 0).toLocaleString()}
                        </p>
                        {order.deliveryMethod && (
                          <p className={`text-xs mt-2 font-medium ${buyerOwned ? 'text-gray-400' : 'text-gray-500'}`}>
                            {order.deliveryMethod}
                          </p>
                        )}
                        {otherFleet && !buyerOwned && (
                          <p className="text-xs text-amber-700 mt-2 font-medium">Assigned to another fleet</p>
                        )}
                      </div>
                      {selected && !blocked && (
                        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shrink-0">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {pagedOrders.map((order) => {
                const selected    = isOrderSelected(order.orderId);
                const otherFleet  = isAssignedToOtherFleet(order);
                const buyerOwned  = isBuyerManaged(order);
                const blocked     = otherFleet || buyerOwned;
                return (
                  <div
                    key={order.orderId}
                    onClick={() => (blocked ? undefined : selected ? handleRemoveOrder(order.orderId) : handleAddOrder(order))}
                    className={`flex items-center gap-4 p-4 border-2 rounded-lg transition-all ${
                      buyerOwned
                        ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-70'
                        : otherFleet
                          ? 'border-amber-300 bg-amber-50/80 cursor-not-allowed opacity-90'
                          : selected
                            ? 'border-green-500 bg-green-50 cursor-pointer'
                            : 'border-[#e6e6e6] hover:border-gray-300 bg-white cursor-pointer'
                    }`}
                    title={
                      buyerOwned  ? `${order.deliveryMethod} — handled by buyer, not assignable to fleet`
                      : otherFleet ? 'Assigned to another fleet'
                      : undefined
                    }
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-gray-900">{order.orderId}</h4>
                      <p className="text-xs text-gray-500">{order.storeName || '—'}</p>
                      <p className="text-sm font-bold text-[#0a61d7] mt-1">
                        IDR {Number(order.totalAmount ?? 0).toLocaleString()}
                      </p>
                      {order.deliveryMethod && (
                        <p className={`text-xs mt-1 font-medium ${buyerOwned ? 'text-gray-400' : 'text-gray-500'}`}>
                          {order.deliveryMethod}
                        </p>
                      )}
                      {otherFleet && !buyerOwned && (
                        <p className="text-xs text-amber-700 mt-1 font-medium">Assigned to another fleet</p>
                      )}
                    </div>
                    {selected && !blocked && (
                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shrink-0">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <span className="text-sm text-gray-500">
                {startIndex + 1}–{Math.min(startIndex + rowsPerPage, filteredOrders.length)} of {filteredOrders.length}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Tip:</strong> Select orders from your system to assign them to this fleet. Assigned orders will appear in the trip summary.
        </p>
      </div>
    </div>
  );
}
