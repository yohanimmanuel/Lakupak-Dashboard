import React from "react";
import { Users, UserCheck, ShoppingCart, Repeat, Truck, CheckCircle, DollarSign, Clock, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useMemo } from 'react';

interface StatcardsProps {
  type: 'buyer' | 'supplier';
  data: any[];
}

function getCurrentMonth() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

function parseCurrency(str: string) {
  return parseInt((str || '').toString().replace(/[^\d]/g, '')) || 0;
}

export default function Statcards({ type, data }: StatcardsProps) {
  const stats = useMemo(() => {
    if (type === 'buyer') {
      const totalBuyers = data.length;
      const activeBuyers = data.filter(b => b.status === 'Active').length;
      const monthKey = getCurrentMonth();
      // Average monthly spend per buyer
      let totalMonthlySpend = 0;
      let totalBoxes = 0;
      data.forEach(buyer => {
        let buyerMonthSpend = 0;
        if (Array.isArray(buyer.orderDetails)) {
          buyer.orderDetails.forEach((o: any) => {
            if (o.lastOrderDate && o.lastOrderDate.startsWith(monthKey)) {
              buyerMonthSpend += parseCurrency(o.totalSpend);
              totalBoxes += parseInt(o.totalOrders) || 0;
            }
          });
        }
        totalMonthlySpend += buyerMonthSpend;
      });
      const avgMonthlySpend = totalBuyers > 0 ? totalMonthlySpend / totalBuyers : 0;
      // Avg. order frequency: average boxes per buyer per month
      const avgOrderFreq = totalBuyers > 0 ? (totalBoxes / totalBuyers).toFixed(1) : '0.0';
      return [
        {
          label: 'Total Buyers',
          value: totalBuyers,
          icon: <Users className="w-6 h-6 text-[#0a61d7]" />, color: 'bg-[#f7faff]', trend: { percent: '+0%', label: 'from last month', up: true }
        },
        {
          label: 'Active Buyers',
          value: activeBuyers,
          icon: <UserCheck className="w-6 h-6 text-green-500" />, color: 'bg-[#e6f7ec]', trend: { percent: '+0%', label: 'from last month', up: true }
        },
        {
          label: 'Monthly Buyer Spend',
          value: 'Rp ' + avgMonthlySpend.toLocaleString('id-ID'),
          icon: <DollarSign className="w-6 h-6 text-yellow-500" />, color: 'bg-[#f7faff]', trend: { percent: '+0%', label: 'from last month', up: true }
        },
        {
          label: 'Avg. Order Frequency',
          value: avgOrderFreq + '/mo',
          icon: <Repeat className="w-6 h-6 text-gray-500" />, color: 'bg-[#e6e6e6]', trend: { percent: '+0%', label: 'from last month', up: true }
        }
      ];
    } else {
      // Supplier stats
      const totalSuppliers = data.length;
      const activeSuppliers = data.filter(s => s.status === 'Active').length;
      const monthKey = getCurrentMonth();
      // Average monthly purchase value per supplier
      let totalMonthlyValue = 0;
      data.forEach(supplier => {
        let supplierMonthValue = 0;
        if (Array.isArray(supplier.supplies)) {
          supplier.supplies.forEach((s: any) => {
            if (s.lastDelivery && s.lastDelivery.startsWith(monthKey)) {
              supplierMonthValue += parseCurrency(s.totalValue);
            }
          });
        }
        totalMonthlyValue += supplierMonthValue;
      });
      const avgMonthlyValue = totalSuppliers > 0 ? totalMonthlyValue / totalSuppliers : 0;
      // On-time delivery rate: average of all suppliers' deliverySuccess (from logistics or supplies)
      let deliverySuccessSum = 0, deliverySuccessCount = 0;
      data.forEach(supplier => {
        // Prefer logistics.deliverySuccess if present, else average from supplies
        if (supplier.logistics && supplier.logistics.deliverySuccess !== undefined && supplier.logistics.deliverySuccess !== '') {
          deliverySuccessSum += parseFloat(supplier.logistics.deliverySuccess);
          deliverySuccessCount++;
        } else if (Array.isArray(supplier.supplies)) {
          supplier.supplies.forEach((s: any) => {
            if (s.deliverySuccess !== undefined && s.deliverySuccess !== '') {
              deliverySuccessSum += parseFloat(s.deliverySuccess);
              deliverySuccessCount++;
            }
          });
        }
      });
      const onTimeRate = deliverySuccessCount > 0 ? Math.round(deliverySuccessSum / deliverySuccessCount) : 0;
      return [
        {
          label: 'Total Suppliers',
          value: totalSuppliers,
          icon: <Truck className="w-6 h-6 text-[#0a61d7]" />, color: 'bg-[#f7faff]', trend: { percent: '+0%', label: 'from last month', up: true }
        },
        {
          label: 'Active Suppliers',
          value: activeSuppliers,
          icon: <CheckCircle className="w-6 h-6 text-green-500" />, color: 'bg-[#e6f7ec]', trend: { percent: '+0%', label: 'from last month', up: true }
        },
        {
          label: 'Monthly Purchase Value',
          value: 'Rp ' + avgMonthlyValue.toLocaleString('id-ID'),
          icon: <DollarSign className="w-6 h-6 text-yellow-500" />, color: 'bg-[#f7faff]', trend: { percent: '+0%', label: 'from last month', up: true }
        },
        {
          label: 'On-time Delivery Rate',
          value: onTimeRate + '%',
          icon: <Clock className="w-6 h-6 text-gray-500" />, color: 'bg-[#e6e6e6]', trend: { percent: '+0%', label: 'from last month', up: true }
        }
      ];
    }
  }, [type, data]);

  return (
    <div className="w-full mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat, idx) => (
        <div
          key={stat.label}
          className={`flex flex-col justify-between p-4 rounded-lg shadow bg-white border border-[#e6e6e6] ${stat.color}`}
        >
          <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white shadow-sm">
              {stat.icon}
            </div>
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{stat.label}</div>
              <div className="text-xl font-bold text-black">{stat.value}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 ml-1">
            {stat.trend.up ? (
              <ArrowUpRight className="w-5 h-5 text-[#3ea73b]" />
            ) : (
              <ArrowDownRight className="w-5 h-5 text-[#f65911]" />
            )}
            <span className={stat.trend.up ? "text-[#3ea73b] text-xs font-semibold" : "text-[#f65911] text-xs font-semibold"}>
              {stat.trend.percent}
            </span>
            <span className="text-gray-400 text-xs">{stat.trend.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
