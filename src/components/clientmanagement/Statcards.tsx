import React from "react";
import { Users, UserCheck, ShoppingCart, Repeat, Truck, CheckCircle, DollarSign, Clock, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface StatcardsProps {
  type: "buyer" | "supplier";
}

const buyerStats = [
  {
    label: "Total Buyers",
    value: 128,
    icon: <Users className="w-6 h-6 text-[#0a61d7]" />,
    color: "bg-[#f7faff]",
    trend: {
      percent: "+3.2%",
      label: "from last month",
      up: true,
    },
  },
  {
    label: "Active Buyers",
    value: 42,
    icon: <UserCheck className="w-6 h-6 text-green-500" />,
    color: "bg-[#e6f7ec]",
    trend: {
      percent: "-1.4%",
      label: "from last month",
      up: false,
    },
  },
  {
    label: "Monthly Buyer Spend",
    value: "Rp 120,000,000",
    icon: <DollarSign className="w-6 h-6 text-yellow-500" />,
    color: "bg-[#f7faff]",
    trend: {
      percent: "+2.1%",
      label: "from last month",
      up: true,
    },
  },
  {
    label: "Avg. Order Frequency",
    value: "2.3/mo",
    icon: <Repeat className="w-6 h-6 text-gray-500" />,
    color: "bg-[#e6e6e6]",
    trend: {
      percent: "-0.8%",
      label: "from last month",
      up: false,
    },
  },
];

const supplierStats = [
  {
    label: "Total Suppliers",
    value: 24,
    icon: <Truck className="w-6 h-6 text-[#0a61d7]" />,
    color: "bg-[#f7faff]",
    trend: {
      percent: "+1.8%",
      label: "from last month",
      up: true,
    },
  },
  {
    label: "Active Suppliers",
    value: 10,
    icon: <CheckCircle className="w-6 h-6 text-green-500" />,
    color: "bg-[#e6f7ec]",
    trend: {
      percent: "-2.5%",
      label: "from last month",
      up: false,
    },
  },
  {
    label: "Monthly Purchase Value",
    value: "Rp 80,000,000",
    icon: <DollarSign className="w-6 h-6 text-yellow-500" />,
    color: "bg-[#f7faff]",
    trend: {
      percent: "+4.0%",
      label: "from last month",
      up: true,
    },
  },
  {
    label: "On-time Delivery Rate",
    value: "96%",
    icon: <Clock className="w-6 h-6 text-gray-500" />,
    color: "bg-[#e6e6e6]",
    trend: {
      percent: "+0.5%",
      label: "from last month",
      up: true,
    },
  },
];

export default function Statcards({ type }: StatcardsProps) {
  const stats = type === "buyer" ? buyerStats : supplierStats;
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
