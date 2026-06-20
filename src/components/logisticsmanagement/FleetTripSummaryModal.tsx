'use client';

import React from 'react';
import { X, CheckCircle, Package, Truck, User, MapPin, CreditCard, Calendar, Layers, PackageCheck, ShieldCheck } from 'lucide-react';
import { getVehicleTypeInfo } from '@/config/vehicleTypes';
import { useLogisticsTranslations } from '@/hooks/useLogisticsTranslations';
import Image from 'next/image';

export interface FleetTripSummaryData {
  orderCode: string;
  routeFrom?: string;
  routeTo?: string;
  route?: string;
  status?: string;
  deliveryType?: string;
  etaCompletionDate?: string | null;
  etaCompletionTime?: string | null;
  assignedDate?: string | null;
  /** Form-only: date string for create/edit (e.g. YYYY-MM-DD) */
  etaDate?: string | null;
  /** Form-only: time string (e.g. HH:mm) */
  etaTime?: string | null;
  paymentTerms?: string;
  assignedLogistics?: string;
  vehicleType?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  plateNumber?: string;
  vehicleMaxWeight?: number;
  vehicleMaxVolume?: number;
  loadPct?: number;
  driverName?: string;
  driverPhone?: string;
  driverExperience?: string;
  driverStatus?: string;
  driverAvatar?: string;
  driverUsername?: string;
  /** Whether a driver app password was set during this form session (never carry plaintext here). */
  driverPasswordSet?: boolean;
  assignedOrders?: { orderId: string; storeName: string; totalAmount: number }[];
  /** IDs of orders marked as delivered (checklist) */
  completedOrderIds?: string[];
}

interface FleetTripSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: FleetTripSummaryData;
  mode: 'create' | 'edit';
  isSubmitting: boolean;
  onSubmit: () => void;
  /** Called when distributor toggles completed orders (checklist) */
  onCompletedOrderIdsChange?: (ids: string[]) => void;
}

function SummaryRow({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
      {Icon && <Icon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xs font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export default function FleetTripSummaryModal({
  isOpen,
  onClose,
  data,
  mode,
  isSubmitting,
  onSubmit,
  onCompletedOrderIdsChange,
}: FleetTripSummaryModalProps) {
  const {
    tTripSummaryModal,
    tShared,
    translateFleetStatus,
    translateDeliveryType,
    translateVehicleType,
  } = useLogisticsTranslations();

  if (!isOpen) return null;

  const route = data.route ?? (data.routeFrom && data.routeTo ? `${data.routeFrom} → ${data.routeTo}` : '');
  const formatEtaDate = (dateStr: string): string => {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const assignedDateDisplay = (() => {
    const raw = data.assignedDate?.trim();
    if (!raw) return '';
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
  })();

  const eta = data.etaCompletionDate
    ? (data.etaCompletionTime?.trim()
        ? `${formatEtaDate(data.etaCompletionDate)} ${data.etaCompletionTime.trim()}`.trim()
        : formatEtaDate(data.etaCompletionDate))
    : (data.etaDate && data.etaTime ? `${data.etaDate} ${data.etaTime}` : data.etaDate || data.etaTime || '');
  const vehicleInfo = getVehicleTypeInfo(data.vehicleType ?? '20ft_container');
  const vehicleTypeLabel = translateVehicleType(data.vehicleType ?? '20ft_container');
  const orders = data.assignedOrders ?? [];
  const totalOrders = orders.length;
  const completedSet = new Set(data.completedOrderIds ?? []);
  const completedCount = completedSet.size;

  const handleToggle = (orderId: string) => {
    const next = new Set(completedSet);
    if (next.has(orderId)) next.delete(orderId);
    else next.add(orderId);
    onCompletedOrderIdsChange?.(Array.from(next));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">{tTripSummaryModal('title')}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700"
            aria-label={tShared('close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Package className="w-4 h-4" />
              {tTripSummaryModal('basicInfo')}
            </h3>
            <div className="border border-gray-200 rounded-lg p-4">
              <SummaryRow label={tTripSummaryModal('fleetCode')} value={data.orderCode ?? ''} />
              <SummaryRow label={tTripSummaryModal('route')} value={route} />
              <SummaryRow label={tTripSummaryModal('status')} value={data.status ? translateFleetStatus(data.status) : ''} />
              <SummaryRow label={tTripSummaryModal('deliveryType')} value={data.deliveryType ? translateDeliveryType(data.deliveryType) : ''} />
              <SummaryRow label={tTripSummaryModal('assignedDate')} value={assignedDateDisplay} />
              <SummaryRow label={tTripSummaryModal('eta')} value={eta} />
              <SummaryRow label={tTripSummaryModal('paymentTerms')} value={data.paymentTerms ?? ''} />
              <SummaryRow label={tTripSummaryModal('assignedLogistics')} value={data.assignedLogistics ?? ''} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Truck className="w-4 h-4" />
              {tTripSummaryModal('vehicle')}
            </h3>
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-4 mb-3">
                <div className="relative w-24 h-12">
                  <Image src={vehicleInfo.imagePath} alt={vehicleTypeLabel} fill className="object-contain" unoptimized sizes="96px" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{tTripSummaryModal('vehicleType')}</p>
                  <p className="text-xs font-medium text-gray-900">{vehicleTypeLabel}</p>
                </div>
              </div>
              <SummaryRow label={tTripSummaryModal('brand')} value={data.vehicleBrand ?? ''} />
              <SummaryRow label={tTripSummaryModal('model')} value={data.vehicleModel ?? ''} />
              <SummaryRow label={tTripSummaryModal('plateNumber')} value={data.plateNumber ?? ''} />
              <SummaryRow label={tTripSummaryModal('maxWeight')} value={data.vehicleMaxWeight != null ? `${data.vehicleMaxWeight.toLocaleString()} ${tShared('units.kg')}` : ''} />
              <SummaryRow label={tTripSummaryModal('maxVolume')} value={data.vehicleMaxVolume != null ? `${data.vehicleMaxVolume.toLocaleString()} ${tShared('units.cubicMeters')}` : ''} />
              <SummaryRow label={tTripSummaryModal('loadPct')} value={data.loadPct != null ? `${data.loadPct}${tShared('units.percent')}` : ''} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <User className="w-4 h-4" />
              {tTripSummaryModal('driver')}
            </h3>
            <div className="border border-gray-200 rounded-lg p-4">
              {data.driverAvatar && (
                <div className="flex justify-center mb-3">
                  <Image src={data.driverAvatar} alt={tTripSummaryModal('driverAlt')} width={48} height={48} className="w-12 h-12 rounded-full object-cover border-2 border-gray-200" unoptimized />
                </div>
              )}
              <SummaryRow label={tTripSummaryModal('name')} value={data.driverName ?? ''} />
              <SummaryRow label={tTripSummaryModal('phone')} value={data.driverPhone ?? ''} />
              <SummaryRow label={tTripSummaryModal('experience')} value={data.driverExperience ?? ''} />
              <SummaryRow label={tTripSummaryModal('status')} value={data.driverStatus ?? ''} />
              <SummaryRow label={tTripSummaryModal('username')} value={data.driverUsername ?? ''} />
              {(data.driverPasswordSet || data.driverUsername) && (
                <div className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500">{tTripSummaryModal('password')}</p>
                    <span className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {tTripSummaryModal('credentialsConfigured')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {(data.assignedOrders?.length ?? 0) > 0 ? (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Layers className="w-4 h-4" />
                {tTripSummaryModal('assignedOrders', { count: (data.assignedOrders ?? []).length })}
              </h3>
              <div className="border border-gray-200 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700 flex items-center gap-2">
                    <PackageCheck className="w-3.5 h-3.5" />
                    {tTripSummaryModal('deliveriesCompleted')}
                  </span>
                  <span className="text-xs font-semibold text-[#0a61d7]">
                    {tTripSummaryModal('completedOfTotal', { completed: completedCount, total: totalOrders })}
                  </span>
                </div>
                <ul className="space-y-2">
                  {orders.map((o) => (
                    <li key={o.orderId} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                      <button
                        type="button"
                        onClick={() => handleToggle(o.orderId)}
                        className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center shrink-0 ${
                          completedSet.has(o.orderId)
                            ? 'bg-green-500 border-green-500'
                            : 'bg-white border-gray-300 hover:border-green-400'
                        }`}
                      >
                        {completedSet.has(o.orderId) && (
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                      <span className="font-medium text-xs text-gray-900 truncate">{o.orderId}</span>
                      <span className="text-gray-600 text-xs truncate">{o.storeName || tShared('notApplicable')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Layers className="w-4 h-4" />
                {tTripSummaryModal('deliveries')}
              </h3>
              <div className="border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500">{tTripSummaryModal('noOrdersHint')}</p>
              </div>
            </section>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium text-sm"
          >
            {tTripSummaryModal('back')}
          </button>
          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white hover:bg-[#084ba6] font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {mode === 'create' ? tTripSummaryModal('creating') : tTripSummaryModal('saving')}
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                {mode === 'create' ? tTripSummaryModal('createFleet') : tTripSummaryModal('saveChanges')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
