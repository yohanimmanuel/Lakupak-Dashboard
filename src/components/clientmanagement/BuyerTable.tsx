'use client';
import React, { useState, useRef, useLayoutEffect } from "react";
import { useRouter } from 'next/navigation';
import { Search, Eye, Filter, Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const buyersMock = [
  {
    id: "Buyer-001",
    name: "Toko Sukses Jaya",
    address: "Jl. Raya No. 123, Jakarta",
    phone: "0812-3456-7890",
    totalOrders: 12,
    totalSpend: "Rp 12,000,000",
    lastOrderDate: "2024-01-15",
    outstanding: "Rp 2,000,000",
    status: "Active",
    businessType: "Retailer",
  },
  {
    id: "Buyer-002",
    name: "Warung Makmur",
    address: "Jl. Raya No. 456, Jakarta",
    phone: "0813-9876-5432",
    totalOrders: 8,
    totalSpend: "Rp 8,000,000",
    lastOrderDate: "2024-02-20",
    outstanding: "Rp 0",
    status: "Active",
    businessType: "Wholesaler",
  },
  {
    id: "Buyer-003",
    name: "MiniMart Sentosa",
    address: "Jl. Raya No. 789, Jakarta",
    phone: "0811-2233-4455",
    totalOrders: 20,
    totalSpend: "Rp 20,000,000",
    lastOrderDate: "2024-03-10",
    outstanding: "Rp 5,000,000",
    status: "Inactive",
    businessType: "Retailer",
  },
  {
    id: "Buyer-004",
    name: "Store Maju",
    address: "Jl. Raya No. 101, Jakarta",
    phone: "0814-1234-5678",
    totalOrders: 10,
    totalSpend: "Rp 10,000,000",
    lastOrderDate: "2024-04-01",
    outstanding: "Rp 1,000,000",
    status: "Blocked",
    businessType: "Wholesaler",
  },
];

const statusTabs = [
  { label: "All" },
  { label: "Active" },
  { label: "Inactive" },
  { label: "Blocked" },
];

const filterOptions = ["All Types", "Retailer", "Wholesaler"];
const periodOptions = ["This Month", "Last Month"];

export default function BuyerTable({ onSelectBuyer }: { onSelectBuyer?: (buyer: any) => void }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedTab, setSelectedTab] = useState("All");
  const [filter, setFilter] = useState(filterOptions[0]);
  const [period, setPeriod] = useState(periodOptions[0]);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
  const buyers = buyersMock.filter(b => b.name.toLowerCase().includes(search.toLowerCase()));
  const router = useRouter();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const rowsPerPage = 10;
  const totalRows = buyers.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedBuyers = buyers.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const fromRow = totalRows === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const toRow = Math.min(page * rowsPerPage, totalRows);


  useLayoutEffect(() => {
    const idx = statusTabs.findIndex(tab => tab.label === selectedTab);
    const node = tabRefs.current[idx];
    if (node) {
      setIndicatorStyle({
        left: node.offsetLeft,
        width: node.offsetWidth,
      });
    }
  }, [selectedTab]);

  const handleView = (buyer: any) => {
    // In the future, pass buyer id as param
    router.push('/clients/buyers/details');
  };

  const tabIdx = statusTabs.findIndex(tab => tab.label === selectedTab);

  // Filtering logic
  let filteredBuyers = buyers.filter(b => b.name.toLowerCase().includes(search.toLowerCase()));
  if (selectedTab !== "All") filteredBuyers = filteredBuyers.filter(b => b.status === selectedTab);
  if (filter !== "All Types") filteredBuyers = filteredBuyers.filter(b => b.businessType === filter);
  // (Period filter is mock, not applied to data)

  // Status color helper
  const statusBadge = (status: string) => {
    if (status === "Active") return "bg-green-100 text-green-500";
    if (status === "Inactive") return "bg-gray-100 text-gray-500";
    if (status === "Blocked") return "bg-red-100 text-red-500";
    return "bg-gray-100 text-gray-500";
  };

  return (
    <div className="w-full mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-4 mt-3">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        {/* Status Tabs - Segmented Control */}
        <div className="relative w-full md:w-auto flex items-center">
          <div className="flex w-full md:w-auto bg-gray-100 rounded-lg overflow-hidden relative">
            {/* Sliding Indicator */}
            <div
              className="absolute top-0 h-full transition-all duration-300"
              style={{
                left: indicatorStyle.left,
                width: indicatorStyle.width,
                background: '#0a61d7',
                borderRadius: '0.75rem',
                zIndex: 1,
              }}
            />
            {statusTabs.map((tab, idx) => (
              <button
                key={tab.label}
                ref={el => { tabRefs.current[idx] = el; }}
                onClick={() => setSelectedTab(tab.label)}
                className={`relative z-10 flex-1 px-6 py-2 font-medium text-[14px] transition-colors duration-200 focus:outline-none ${
                  selectedTab === tab.label
                    ? 'text-white'
                    : 'text-gray-700 hover:text-[#0a61d7]'
                } ${
                  idx === 0 ? 'rounded-l-lg' : idx === statusTabs.length - 1 ? 'rounded-r-lg' : ''
                }`}
                style={{
                  background: 'transparent',
                  boxShadow: 'none',
                  minWidth: 0,
                  flex: 'unset',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {/* Search and Filters */}
        <div className="flex gap-2 w-full md:w-auto items-center justify-end">
          <div className="relative w-full md:w-64">
            <input
              type="text"
              placeholder="Search buyers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#e6e6e6] text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7] bg-white"
            />
            <Search className="absolute left-3 top-2 text-gray-400 w-5 h-5" />
          </div>
          {/* Filter Dropdown */}
          <div className="relative">
            <button
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
              onClick={() => {
                setShowFilterDropdown(v => !v);
                setShowPeriodDropdown(false);
              }}
            >
              <Filter className="w-4 h-4" />
              {filter}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showFilterDropdown && (
              <div className="absolute right-0 mt-2 w-31.5 bg-white border border-gray-200 rounded-lg shadow z-20">
                {filterOptions.map(opt => (
                  <button
                    key={opt}
                    onClick={() => { setFilter(opt); setShowFilterDropdown(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${filter === opt ? 'font-bold text-[#0a61d7]' : 'text-gray-700'}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Period Dropdown */}
          <div className="relative">
            <button
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
              onClick={() => {
                setShowPeriodDropdown(v => !v);
                setShowFilterDropdown(false);
              }}
            >
              <Calendar className="w-4 h-4" />
              {period}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showPeriodDropdown && (
              <div className="absolute right-0 mt-2 w-35 bg-white border border-gray-200 rounded-lg shadow z-20">
                {periodOptions.map(opt => (
                  <button
                    key={opt}
                    onClick={() => { setPeriod(opt); setShowPeriodDropdown(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${period === opt ? 'font-bold text-[#0a61d7]' : 'text-gray-700'}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto hidden md:block rounded-lg">
        <table className="min-w-full text-sm text-left whitespace-nowrap text-xs">
          <thead className="bg-gray-100 text-gray-500 whitespace-nowrap">
            <tr>
              <th className="py-3 px-4 font-medium uppercase">ID</th>
              <th className="py-3 px-4 font-medium uppercase">Name</th>
              <th className="py-3 px-4 font-medium uppercase">Address</th>
              <th className="py-3 px-4 font-medium uppercase">Business Type</th>
              <th className="py-3 px-4 font-medium uppercase">Total Orders</th>
              <th className="py-3 px-4 font-medium uppercase">Last Order Date</th>
              <th className="py-3 px-4 font-medium uppercase">Outstanding</th>
              <th className="py-3 px-4 font-medium uppercase">Status</th>
              <th className="py-3 px-4 font-medium uppercase text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {pagedBuyers.map(buyer => (
              <tr key={buyer.id} className="border-b transition">
                <td className="py-3 px-4 font-medium text-black">{buyer.id}</td>
                <td className="py-3 px-4 font-medium text-black">{buyer.name}</td>
                <td className="py-3 px-4 text-black">{buyer.address}</td>
                <td className="py-3 px-4 text-black">{buyer.businessType}</td>
                <td className="py-3 px-4 text-black">{buyer.totalOrders}</td>
                <td className="py-3 px-4 text-black">{buyer.lastOrderDate}</td>
                <td className="py-3 px-4 text-[#f65911] font-semibold">{buyer.outstanding}</td>
                <td className="py-3 px-4">
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${statusBadge(buyer.status)}`}>
                    {buyer.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  <button
                    className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-[#e6e6e6] transition"
                    onClick={() => handleView(buyer)}
                  >
                    <Eye className="w-4 h-4 text-[#0a61d7]" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile Cards */}
      <div className="md:hidden flex flex-col gap-4">
        {pagedBuyers.map(buyer => (
          <div key={buyer.id} className="bg-white rounded-lg shadow p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#0a61d7]">{buyer.name}</span>
              <button
                className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-[#e6e6e6] transition"
                onClick={() => handleView(buyer)}
              >
                <Eye className="w-4 h-4 text-[#0a61d7]" />
              </button>
            </div>
            <div className="text-xs text-gray-500">Address: <span className="text-black font-medium">{buyer.address}</span></div>
            <div className="text-xs text-gray-500">Business Type: <span className="text-black font-medium">{buyer.businessType}</span></div>
            <div className="text-xs text-gray-500">Total Orders: <span className="text-black font-medium">{buyer.totalOrders}</span></div>
            <div className="text-xs text-gray-500">Last Order Date: <span className="text-black font-medium">{buyer.lastOrderDate}</span></div>
            <div className="text-xs text-gray-500">Outstanding: <span className="text-[#f65911] font-semibold">{buyer.outstanding}</span></div>
            <div className="text-xs text-gray-500">
              Status: <span className={`inline-block px-2 py-1 rounded-full font-bold ${statusBadge(buyer.status)}`}>{buyer.status}</span>
            </div>
          </div>
        ))}
      </div>
      {/* Pagination */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-2">
        {/* Left: Showing X to Y of Z */}
        <div className="text-sm text-gray-500">
          Showing {fromRow} to {toRow} of {totalRows}
        </div>
        {/* Right: Pagination Controls */}
        <div className="flex items-center gap-3">
          <button
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              className={`px-3 py-2 rounded-lg font-semibold text-sm transition ${
                p === page ? 'bg-[#0a61d7] text-white' : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
              }`}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          ))}
          <button
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
