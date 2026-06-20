'use client';

import React, { useState, useRef, useLayoutEffect, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Edit, X, ChevronLeft, ChevronRight, Search, Filter, ChevronDown } from 'lucide-react';
import { Campaign, CampaignTableRow } from '@/types/campaign';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { useUserStore } from '@/store/userStore';
import { format } from 'date-fns';
import SendCampaignModal from './SendCampaignModal';
import { useMarketingTranslations } from '@/hooks/useMarketingTranslations';

const statusTabs = [
  { label: 'All' },
  { label: 'Draft' },
  { label: 'Scheduled' },
  { label: 'Completed' },
];

interface CampaignTableProps {
  campaigns?: Campaign[];
  onViewCampaign?: (campaign: Campaign) => void;
  onDuplicateCampaign?: (campaign: Campaign) => void;
  onDeleteCampaign?: (campaign: Campaign) => void;
  onUpdateCampaign?: (campaign: Campaign) => void;
  campaignToTableRow: (campaign: Campaign) => CampaignTableRow;
}

export default function CampaignTable({
  campaigns = [],
  onViewCampaign,
  onDuplicateCampaign,
  onDeleteCampaign,
  onUpdateCampaign,
  campaignToTableRow,
}: CampaignTableProps) {
  const {
    tCampaignTable,
    tShared,
    translateStatusTab,
    translateCampaignStatus,
    translateRecipientOption,
  } = useMarketingTranslations();
  const user = useUserStore((state) => state.user);
  const router = useRouter();
  const userCurrency = user?.currency || getDefaultCurrency();

  const [selectedTab, setSelectedTab] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState('All Recipients');
  const [showRecipientDropdown, setShowRecipientDropdown] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<CampaignTableRow | null>(null);
  const [isBulkDelete, setIsBulkDelete] = useState(false);
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [showSendModal, setShowSendModal] = useState(false);
  const [campaignToSend, setCampaignToSend] = useState<Campaign | null>(null);

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const updateIndicator = () => {
      const activeIndex = statusTabs.findIndex((tab) => tab.label === selectedTab);
      if (activeIndex === -1 || !tabRefs.current[activeIndex]) return;

      const activeTab = tabRefs.current[activeIndex];
      if (activeTab) {
        setIndicatorStyle({
          left: activeTab.offsetLeft,
          width: activeTab.offsetWidth,
        });
      }
    };

    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [selectedTab]);

  const tableRows = useMemo(() => campaigns.map(campaignToTableRow), [campaigns, campaignToTableRow]);

  // Get unique recipients for filter dropdown
  const uniqueRecipients = useMemo(() => {
    const recipients = new Set<string>();
    tableRows.forEach((row) => {
      if (row.recipients) {
        recipients.add(row.recipients);
      }
    });
    return Array.from(recipients).sort();
  }, [tableRows]);

  const filteredCampaigns = useMemo(() => {
    let filtered = tableRows;

    // Apply status filter
    if (selectedTab !== 'All') {
      if (selectedTab === 'Completed') {
        filtered = filtered.filter((c) => c.status === 'Sent' || c.status === 'Completed');
      } else {
        filtered = filtered.filter((c) => c.status === selectedTab);
      }
    }

    // Apply search filter
    if (search && search.trim().length > 0) {
      const sanitizedSearch = search.trim().toLowerCase();
      filtered = filtered.filter((c) =>
        String(c.name || '').toLowerCase().includes(sanitizedSearch) ||
        String(c.campaignId || '').toLowerCase().includes(sanitizedSearch)
      );
    }

    // Apply recipient filter
    if (selectedRecipient !== 'All Recipients') {
      filtered = filtered.filter((c) => c.recipients === selectedRecipient);
    }

    return filtered;
  }, [tableRows, selectedTab, search, selectedRecipient]);

  // Pagination
  const rowsPerPage = 5;
  const totalRows = filteredCampaigns.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedCampaigns = useMemo(() => {
    return filteredCampaigns.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  }, [filteredCampaigns, page, rowsPerPage]);

  const fromRow = totalRows === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const toRow = Math.min(page * rowsPerPage, totalRows);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setPage(1);
  }, [selectedTab, search, selectedRecipient]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.relative')) {
        setShowRecipientDropdown(false);
      }
    };

    if (showRecipientDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showRecipientDropdown]);

  const statusCounts = useMemo(() => {
    const counts = {
      All: tableRows.length,
      Draft: tableRows.filter((c) => c.status === 'Draft').length,
      Scheduled: tableRows.filter((c) => c.status === 'Scheduled').length,
      Completed: tableRows.filter((c) => c.status === 'Sent' || c.status === 'Completed').length,
    };
    return counts;
  }, [tableRows]);

  const statusBadge = useCallback((status: string) => {
    if (status === 'Sent' || status === 'Completed') return 'bg-green-100 text-green-700 border-green-200';
    if (status === 'Scheduled') return 'bg-blue-100 text-blue-700 border-blue-200';
    return 'bg-gray-100 text-gray-700 border-gray-200';
  }, []);

  const handleDelete = (campaign: CampaignTableRow) => {
    setCampaignToDelete(campaign);
    setIsBulkDelete(false);
    setShowDeleteModal(true);
  };

  const handleBulkDelete = () => {
    if (selectedCampaigns.size === 0) return;
    setIsBulkDelete(true);
    setCampaignToDelete(null);
    setShowDeleteModal(true);
  };

  const handleBulkSend = () => {
    if (selectedCampaigns.size === 0) return;
    // For bulk send, we'll send the first selected campaign
    // In a real implementation, you might want to handle multiple campaigns differently
    const firstCampaignId = Array.from(selectedCampaigns)[0];
    const campaignToSend = campaigns.find((c) => c.id === firstCampaignId);
    if (campaignToSend) {
      setCampaignToSend(campaignToSend);
      setShowSendModal(true);
    }
  };

  const handleSendCampaign = async (campaignData: Campaign) => {
    // Update campaign status to Sent (only if not already sent)
    if (onUpdateCampaign) {
      const isResend = campaignData.status === 'Sent' || campaignData.status === 'Completed';
      await onUpdateCampaign({
        ...campaignData,
        status: 'Sent',
        // Only update sentDate for first send, keep original for resends
        sentDate: isResend ? campaignData.sentDate : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    setShowSendModal(false);
    setCampaignToSend(null);
    // Clear selection after sending
    setSelectedCampaigns(new Set());
  };

  const confirmDelete = () => {
    if (isBulkDelete) {
      selectedCampaigns.forEach(campaignId => {
        const campaign = campaigns.find((c) => c.id === campaignId);
        if (campaign && onDeleteCampaign) {
          onDeleteCampaign(campaign);
        }
      });
      setSelectedCampaigns(new Set());
    } else {
      if (campaignToDelete && onDeleteCampaign) {
        const originalCampaign = campaigns.find((c) => c.id === campaignToDelete.id);
        if (originalCampaign) {
          onDeleteCampaign(originalCampaign);
        }
      }
    }
    setShowDeleteModal(false);
    setCampaignToDelete(null);
    setIsBulkDelete(false);
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setCampaignToDelete(null);
    setIsBulkDelete(false);
  };

  const handleCampaignSelect = (campaignId: string) => {
    setSelectedCampaigns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(campaignId)) {
        newSet.delete(campaignId);
      } else {
        newSet.add(campaignId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedCampaigns.size === filteredCampaigns.length && filteredCampaigns.length > 0) {
      setSelectedCampaigns(new Set());
    } else {
      setSelectedCampaigns(new Set(filteredCampaigns.map(c => c.id)));
    }
  };

  const allFilteredSelected = selectedCampaigns.size === filteredCampaigns.length && filteredCampaigns.length > 0;

  const handleView = (campaign: CampaignTableRow) => {
    if (onViewCampaign) {
      const originalCampaign = campaigns.find((c) => c.id === campaign.id);
      if (originalCampaign) {
        onViewCampaign(originalCampaign);
      }
    } else {
      router.push(`/marketing/campaigns/details?id=${campaign.id}`);
    }
  };

  const handleDuplicate = (campaign: CampaignTableRow) => {
    if (onDuplicateCampaign) {
      const originalCampaign = campaigns.find((c) => c.id === campaign.id);
      if (originalCampaign) {
        onDuplicateCampaign(originalCampaign);
      }
    }
  };

  // Check if the selected campaign is already sent (for resend functionality)
  const getSelectedCampaignStatus = (): string | null => {
    if (selectedCampaigns.size !== 1) return null;
    const campaignId = Array.from(selectedCampaigns)[0];
    const campaign = campaigns.find((c) => c.id === campaignId);
    return campaign?.status || null;
  };

  const isResendMode = () => {
    const status = getSelectedCampaignStatus();
    return status === 'Sent' || status === 'Completed';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return format(new Date(dateString), 'MMMM d, yyyy \'at\' h:mm a');
    } catch {
      return dateString;
    }
  };

  return (
    <>
      <div className="w-full mx-auto bg-white rounded-lg border border-[#e6e6e6] p-4 mt-3">
      {/* Status Tabs */}
      <div className="mb-4">
        <div className="relative w-full md:w-auto flex items-center">
          <div className="flex w-full md:w-auto bg-gray-100 rounded-lg overflow-hidden relative">
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
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                onClick={() => {
                  setSelectedTab(tab.label);
                  setSelectedCampaigns(new Set());
                }}
                className={`relative z-10 flex-1 px-6 py-2 font-medium text-[14px] transition-colors duration-200 focus:outline-none ${
                  selectedTab === tab.label ? 'text-white' : 'text-gray-700 hover:text-[#0a61d7]'
                } ${idx === 0 ? 'rounded-l-lg' : idx === statusTabs.length - 1 ? 'rounded-r-lg' : ''}`}
                style={{
                  background: 'transparent',
                  boxShadow: 'none',
                  minWidth: 0,
                  flex: 'unset',
                }}
              >
                {translateStatusTab(tab.label)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-2 w-full md:w-auto items-center justify-start mb-4">
        <div className="relative w-full md:w-64 shrink-0">
          <input
            type="text"
            placeholder={tCampaignTable('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#e6e6e6] text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7] bg-white"
            aria-label={tCampaignTable('searchAriaLabel')}
            maxLength={100}
          />
          <Search className="absolute left-3 top-2 text-gray-400 w-5 h-5" />
        </div>

        {/* Recipients Filter Dropdown */}
        <div className="relative">
          <button
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
            onClick={() => {
              setShowRecipientDropdown((v) => !v);
            }}
          >
            <Filter className="w-4 h-4" />
            {translateRecipientOption(selectedRecipient)}
            <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
          </button>
          {showRecipientDropdown && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-[#e6e6e6] rounded-lg shadow z-20 max-h-60 overflow-y-auto">
              <button
                onClick={() => {
                  setSelectedRecipient('All Recipients');
                  setShowRecipientDropdown(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                  selectedRecipient === 'All Recipients' ? 'font-bold text-[#0a61d7]' : 'text-gray-700'
                }`}
              >
                {translateRecipientOption('All Recipients')}
              </button>
              {uniqueRecipients.map((recipient) => (
                <button
                  key={recipient}
                  onClick={() => {
                    setSelectedRecipient(recipient);
                    setShowRecipientDropdown(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                    selectedRecipient === recipient ? 'font-bold text-[#0a61d7]' : 'text-gray-700'
                  }`}
                >
                  {recipient}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

        {/* Bulk Action Bar */}
        {selectedCampaigns.size > 0 && (
          <div className="bg-gradient-to-r from-green-500 to-green-400 rounded-lg p-3 md:p-4 mb-2">
            <div className="md:hidden space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="flex items-center justify-center text-sm font-semibold text-white">
                    {selectedCampaigns.size}
                  </div>
                  <span className="text-sm font-semibold text-white">
                    {selectedCampaigns.size === 1
                      ? tCampaignTable('campaignSelected')
                      : tCampaignTable('campaignsSelected')}{' '}
                    {tCampaignTable('selected')}
                  </span>
                </div>
              </div>
              <div className="text-white text-xs font-semibold leading-relaxed">
                {selectedCampaigns.size === 1
                  ? isResendMode()
                    ? tCampaignTable('bulkHintSingleResend')
                    : tCampaignTable('bulkHintSingleSend')
                  : tCampaignTable('bulkHintMultiple')}
              </div>
              <div className="flex gap-2">
                {selectedCampaigns.size === 1 && (
                  <button
                    onClick={handleBulkSend}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold text-sm rounded-lg hover:bg-emerald-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label={
                      isResendMode()
                        ? tCampaignTable('resendSelectedAriaLabel')
                        : tCampaignTable('sendSelectedAriaLabel')
                    }
                  >
                    <img src="/whatsapp.svg" alt="WhatsApp" className="w-4 h-4" />
                    {isResendMode()
                      ? tCampaignTable('resendCampaign')
                      : tCampaignTable('sendCampaign')}
                  </button>
                )}
                <button
                  onClick={handleBulkDelete}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 ${selectedCampaigns.size === 1 ? '' : 'flex-1'}`}
                  aria-label={tCampaignTable('removeSelectedAriaLabel', { count: selectedCampaigns.size })}
                >
                  <Trash2 className="w-4 h-4" />
                  {selectedCampaigns.size === 1
                    ? tCampaignTable('removeCampaign')
                    : tCampaignTable('removeSelected')}
                </button>
              </div>
            </div>
            
            <div className="hidden md:flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <div className="text-white flex items-center justify-center text-sm font-semibold">
                    {selectedCampaigns.size}
                  </div>
                  <span className="text-sm font-semibold text-white">
                    {selectedCampaigns.size === 1
                      ? tCampaignTable('campaignSelected')
                      : tCampaignTable('campaignsSelected')}{' '}
                    {tCampaignTable('selected')}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-white text-xs md:text-sm font-semibold">
                  {selectedCampaigns.size === 1
                    ? isResendMode()
                      ? tCampaignTable('bulkHintSingleResend')
                      : tCampaignTable('bulkHintSingleSend')
                    : tCampaignTable('bulkHintMultiple')}
                </span>
                {selectedCampaigns.size === 1 && (
                  <button
                    onClick={handleBulkSend}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold text-sm rounded-lg hover:bg-emerald-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label={
                      isResendMode()
                        ? tCampaignTable('resendSelectedAriaLabel')
                        : tCampaignTable('sendSelectedAriaLabel')
                    }
                  >
                    <img src="/whatsapp.svg" alt="WhatsApp" className="w-4 h-4" />
                    {isResendMode()
                      ? tCampaignTable('resendCampaign')
                      : tCampaignTable('sendCampaign')}
                  </button>
                )}
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={tCampaignTable('removeSelectedAriaLabel', { count: selectedCampaigns.size })}
                >
                  <Trash2 className="w-4 h-4" />
                  {selectedCampaigns.size === 1
                    ? tCampaignTable('removeCampaign')
                    : tCampaignTable('removeSelected')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Campaign List */}
        <div className="space-y-0 -mx-4">
          {pagedCampaigns.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-sm">{tCampaignTable('empty')}</p>
            </div>
          ) : (
            <>
              {/* Select All Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e6e6e6]">
                <button
                  onClick={handleSelectAll}
                  className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center flex-shrink-0 focus:outline-none ${
                    allFilteredSelected
                      ? 'bg-green-500 border-green-500'
                      : 'bg-white border-gray-300 hover:border-green-400'
                  }`}
                  aria-label={
                    allFilteredSelected
                      ? tCampaignTable('deselectAllCampaigns')
                      : tCampaignTable('selectAllCampaigns')
                  }
                >
                  {allFilteredSelected && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
                <span className="text-sm font-medium text-gray-700">
                  {allFilteredSelected
                    ? tCampaignTable('deselectAll')
                    : tCampaignTable('selectAll')}{' '}
                  ({filteredCampaigns.length})
                </span>
              </div>
              {pagedCampaigns.map((campaignRow, index) => {
                const campaign = campaigns.find((c) => c.id === campaignRow.id);
                return (
              <div
                key={campaignRow.id}
                className={`flex items-start justify-between py-4 px-4 ${
                  index !== pagedCampaigns.length - 1 ? 'border-b border-[#e6e6e6]' : ''
                }`}
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <button
                    onClick={() => handleCampaignSelect(campaignRow.id)}
                    className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center flex-shrink-0 mt-1 focus:outline-none ${
                      selectedCampaigns.has(campaignRow.id)
                        ? 'bg-green-500 border-green-500'
                        : 'bg-white border-gray-300 hover:border-green-400'
                    }`}
                    aria-label={
                      selectedCampaigns.has(campaignRow.id)
                        ? tCampaignTable('deselectCampaign', { name: campaignRow.name })
                        : tCampaignTable('selectCampaign', { name: campaignRow.name })
                    }
                  >
                    {selectedCampaigns.has(campaignRow.id) && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-black mb-1">{campaignRow.name}</h3>
                    {campaign?.description && (
                      <p className="text-sm text-gray-500 mb-2 line-clamp-2">{campaign.description}</p>
                    )}
                  <div className="space-y-1 text-sm text-gray-600">
                    <p>{tCampaignTable('recipients')} {campaignRow.recipients}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span>{campaignRow.opensCount || 0} {tCampaignTable('opened')}</span>
                      <span>{campaignRow.clicksCount || 0} {tCampaignTable('clicked')}</span>
                    </div>
                  </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-3 ml-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${statusBadge(campaignRow.status)}`}
                    >
                      {translateCampaignStatus(campaignRow.status)}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleView(campaignRow)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none"
                        aria-label={tCampaignTable('editCampaign')}
                      >
                        <Edit className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(campaignRow)}
                        className="p-2 hover:bg-red-100 rounded-lg transition-colors focus:outline-none"
                        aria-label={tCampaignTable('deleteCampaign')}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    {tCampaignTable('sendDate')}{' '}
                    {campaignRow.sentDate ? formatDate(campaignRow.sentDate) : tCampaignTable('notSent')}
                  </p>
                </div>
              </div>
              );
              })}
            </>
          )}
        </div>

        {/* Pagination */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-t border-[#e6e6e6] pt-4 -mx-4 px-4 gap-2">
            {/* Left: Showing X to Y of Z */}
            <div className="text-sm text-gray-500">
              {tCampaignTable('pagination.showing', { from: fromRow, to: toRow, total: totalRows })}
            </div>
            {/* Right: Pagination Controls */}
            <div className="flex items-center gap-3">
              <button
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                aria-label={tCampaignTable('previousPage')}
              >
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  className={`px-3 py-2 rounded-lg font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    p === page ? 'bg-[#0a61d7] text-white' : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
                  }`}
                  onClick={() => setPage(p)}
                  aria-label={tCampaignTable('page', { page: p })}
                  aria-current={p === page ? 'page' : undefined}
                >
                  {p}
                </button>
              ))}
              <button
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={() => setPage(page + 1)}
                disabled={page === totalPages}
                aria-label={tCampaignTable('nextPage')}
              >
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-2 text-red-500">
              {isBulkDelete ? tCampaignTable('deleteCampaignsTitle') : tCampaignTable('deleteCampaignTitle')}
            </h2>
            <p className="mb-4 text-gray-500">
              {isBulkDelete
                ? tCampaignTable('deleteBulkConfirm', { count: selectedCampaigns.size })
                : tCampaignTable('deleteSingleConfirm', {
                    name: campaignToDelete?.name || tCampaignTable('thisCampaign'),
                  })}
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                onClick={handleDeleteCancel}
              >
                {tShared('cancel')}
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                onClick={confirmDelete}
              >
                {tShared('delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Campaign Modal */}
      <SendCampaignModal
        open={showSendModal}
        onClose={() => {
          setShowSendModal(false);
          setCampaignToSend(null);
        }}
        campaign={campaignToSend}
        onSend={handleSendCampaign}
      />
    </>
  );
}

