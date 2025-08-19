'use client';
import React, { useState, useRef, useLayoutEffect } from "react";
import { useRouter } from 'next/navigation';
import { Search, Eye, Filter, Calendar, ChevronDown, ChevronLeft, ChevronRight, Trash } from "lucide-react";
import * as XLSX from 'xlsx';

// Use buyers prop or state, not buyersMock
// Add explicit types for all map/filter parameters

const statusTabs = [
  { label: "All" },
  { label: "Active" },
  { label: "Inactive" },
  { label: "Blocked" },
];

export default function BuyerTable({ buyers = [], onSelectBuyer, onExportXLSX, profileToTableRow }: { buyers?: any[]; onSelectBuyer?: (buyer: any) => void; onExportXLSX?: (wb: any, filename: string) => void; profileToTableRow: (buyer: any) => any }) {
  const tableRows = buyers.map(profileToTableRow);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedTab, setSelectedTab] = useState("All");
  const businessTypeSet = new Set(tableRows.map((b: any) => b.businessType).filter(Boolean));
  const filterOptions = ["All Types", ...Array.from(businessTypeSet)];
  const [filter, setFilter] = useState(filterOptions[0]);
  const periodOptions = ["This Month", "Last Month"];
  const [period, setPeriod] = useState(periodOptions[0]);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
  const buyersList = tableRows.filter((b: any) => String(b.name).toLowerCase().includes(search.toLowerCase()));
  const router = useRouter();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const rowsPerPage = 7;
  let filteredBuyers = buyersList;
  if (selectedTab !== "All") filteredBuyers = filteredBuyers.filter((b: any) => b.status === selectedTab);
  if (filter !== "All Types") filteredBuyers = filteredBuyers.filter((b: any) => b.businessType === filter);
  if (search) filteredBuyers = filteredBuyers.filter((b: any) => String(b.name).toLowerCase().includes(search.toLowerCase()));
  const totalRows = filteredBuyers.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedBuyers = filteredBuyers.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const fromRow = totalRows === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const toRow = Math.min(page * rowsPerPage, totalRows);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [buyerToDelete, setBuyerToDelete] = useState<any>(null);

  const handleDeleteClick = (buyer: any) => {
    setBuyerToDelete(buyer);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!buyerToDelete) return;
    await fetch(`/api/buyers?id=${buyerToDelete.buyerId}`, { method: 'DELETE' });
    setShowDeleteModal(false);
    setBuyerToDelete(null);
    window.location.reload(); // Or call fetchBuyers if available
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setBuyerToDelete(null);
  };


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
    router.push(`/clients/buyers/details/${buyer.buyerId}`);
  };

  const handleDelete = async (buyer: any) => {
    if (!window.confirm('Are you sure you want to delete this buyer?')) return;
    await fetch(`/api/buyers?id=${buyer.buyerId}`, { method: 'DELETE' });
    window.location.reload(); // Or call fetchBuyers if available via props
  };

  const tabIdx = statusTabs.findIndex(tab => tab.label === selectedTab);

  // Status color helper
  const statusBadge = (status: string) => {
    if (status === "Active") return "bg-green-100 text-green-500";
    if (status === "Inactive") return "bg-gray-100 text-gray-500";
    if (status === "Blocked") return "bg-red-100 text-red-500";
    return "bg-gray-100 text-gray-500";
  };

  // Export XLSX function
  const handleExportXLSX = () => {
    const headers = ['ID', 'Name', 'Address', 'Business Type', 'Last Order Date', 'Total Spend', 'Outstanding', 'Status'];
    const rows = filteredBuyers.map((b: any) => [
      b.id,
      b.name,
      b.address,
      b.businessType,
      b.lastOrderDate,
      b.totalSpend,
      b.outstanding,
      b.status
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Buyers');
    if (onExportXLSX) onExportXLSX(wb, 'buyers.xlsx');
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
              <th className="py-3 px-4 font-medium uppercase">Last Order Date</th>
              <th className="py-3 px-4 font-medium uppercase">Total Spend</th>
              <th className="py-3 px-4 font-medium uppercase">Outstanding</th>
              <th className="py-3 px-4 font-medium uppercase">Status</th>
              <th className="py-3 px-4 font-medium uppercase text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {pagedBuyers.map((buyer: any) => (
              <tr key={String(buyer.id)} className="border-b transition">
                <td className="py-3 px-4 font-medium text-black">{String(buyer.id)}</td>
                <td className="py-3 px-4 font-medium text-black">{String(buyer.name)}</td>
                <td className="py-3 px-4 text-black">{String(buyer.address)}</td>
                <td className="py-3 px-4 text-black">{String(buyer.businessType)}</td>
                <td className="py-3 px-4 text-black">{String(buyer.lastOrderDate)}</td>
                <td className="py-3 px-4 text-[#0a61d7] font-semibold">{String(buyer.totalSpend)}</td>
                <td className="py-3 px-4 text-[#f65911] font-semibold">{String(buyer.outstanding)}</td>
                <td className="py-3 px-4">
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${statusBadge(buyer.status)}`}>{String(buyer.status)}</span>
                </td>
                <td className="py-3 px-4 text-center">
                  <button
                    className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-[#e6e6e6] transition mr-1"
                    onClick={() => handleView(buyer)}
                  >
                    <Eye className="w-4 h-4 text-[#0a61d7]" />
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-red-100 transition"
                    onClick={() => handleDeleteClick(buyer)}
                  >
                    <Trash className="w-4 h-4 text-red-500" />
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
          <div key={String(buyer.id)} className="bg-white rounded-lg shadow p-4 flex flex-col gap-2">
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
            <div className="text-xs text-gray-500">Last Order Date: <span className="text-black font-medium">{buyer.lastOrderDate}</span></div>
            <div className="text-xs text-gray-500">Total Spend: <span className="text-[#0a61d7] font-semibold">{buyer.totalSpend}</span></div>
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
      {/* Hidden export trigger for parent */}
      {onExportXLSX && <span style={{ display: 'none' }} id="buyer-table-export-xlsx-trigger" onClick={handleExportXLSX}></span>}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-2 text-red-500">Delete Buyer</h2>
            <p className="mb-4 text-gray-500">Are you sure you want to delete this buyer? This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
                onClick={handleDeleteCancel}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
                onClick={handleDeleteConfirm}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
