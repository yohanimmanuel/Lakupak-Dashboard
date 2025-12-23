'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Edit, Mail, Phone, MapPin, Calendar, Eye, Package, X, Clock, User, Building2, Target, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { SalesAgent } from './TeamList';
import { useUserStore } from '@/store/userStore';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { formatDateLong } from '@/utils/dateUtils';

interface SalesDetailsProps {
  agent: SalesAgent;
  onEdit?: () => void;
  onBack?: () => void;
}

interface FieldReport {
  id: string;
  date: string;
  activities?: {
    visits: number;
    customersMet: number;
    productsDemonstrated: number;
    salesMade: number;
  };
  notes?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
}

interface SalesTarget {
  id?: string;
  period: string;
  goal: number;
  achieved: number;
  unitsSold: number;
}

interface FavoriteProduct {
  productId: string;
  name: string;
  productType: string;
  brand?: string;
  images?: string[];
  sellingPrice?: string;
}

export default function SalesDetails({ agent, onEdit, onBack }: SalesDetailsProps) {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const [selectedMonth, setSelectedMonth] = useState('October, 2024');
  const [selectedYear, setSelectedYear] = useState('This year (2024)');
  const [selectedReport, setSelectedReport] = useState<FieldReport | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportPage, setReportPage] = useState(1);
  const reportsPerPage = 5;
  const [targetPage, setTargetPage] = useState(1);
  const targetsPerPage = 4;

  // Get user currency for display - safe to use on both server and client
  const userCurrency = user?.currency || getDefaultCurrency();

  // Use field reports from agent data, format dates properly
  const fieldReports: FieldReport[] = (agent.fieldReports || []).map(report => ({
    id: report.id,
    date: formatDateLong(report.date) || report.date, // Format ISO date to readable format
    location: report.location,
    startTime: report.startTime,
    endTime: report.endTime,
    activities: report.activities as {
      visits: number;
      customersMet: number;
      productsDemonstrated: number;
      salesMade: number;
    } | undefined,
    notes: report.notes,
  }));

  // Use sales targets from agent data
  const salesTargets: SalesTarget[] = agent.salesTargets || [];

  // Use favorite products from agent data (limit to 3 for display)
  const favoriteProducts: FavoriteProduct[] = (agent.favoriteProducts || []).slice(0, 3);

  // Find current month target based on selectedMonth
  // Extract month name from selectedMonth (e.g., "October, 2024" -> "October")
  const currentMonthName = selectedMonth.split(',')[0]?.trim() || '';
  const currentMonthTarget = salesTargets.find(target => 
    target.period && target.period.toLowerCase().includes(currentMonthName.toLowerCase())
  ) || (salesTargets.length > 0 ? salesTargets[0] : null);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.push('/marketing/team');
    }
  };


  const formatCurrencyAmount = (amount: number) => {
    return formatCurrency(amount, userCurrency);
  };

  const getProgressPercentage = (achieved: number, goal: number) => {
    return Math.min((achieved / goal) * 100, 100);
  };

  const handleViewReport = (report: FieldReport) => {
    setSelectedReport(report);
    setShowReportModal(true);
  };

  const handleCloseReportModal = () => {
    setShowReportModal(false);
    setSelectedReport(null);
  };

  const progressPercentage = currentMonthTarget && currentMonthTarget.goal > 0
    ? getProgressPercentage(currentMonthTarget.achieved, currentMonthTarget.goal)
    : 0;

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <div className="w-full mx-auto">
        {/* Breadcrumb Navigation */}
        <div className="mb-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-lg font-bold text-gray-500 hover:text-black transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to team list
          </button>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">{agent.name}</h1>
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors text-sm font-medium"
              >
                <Edit className="w-4 h-4" />
                Edit details
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column - Profile Summary */}
          <div className="lg:col-span-1 space-y-4">
          {/* Profile Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            {/* Profile Header */}
            <div className="flex flex-col items-center pb-4 border-b border-gray-200">
              <div className="relative mb-4">
                <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden border-4 border-white shadow-md">
                  {agent.avatar ? (
                    <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-medium text-gray-600">
                      {agent.name.split(' ').map(n => n[0]).join('')}
                    </span>
                  )}
                </div>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">{agent.name}</h2>
              <p className="text-sm text-gray-600">{agent.role}</p>
            </div>

            {/* Sales Target Summary */}
            {currentMonthTarget && (
              <div className="py-4 border-b border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">{currentMonthTarget.period} sales target</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {Math.round(progressPercentage)}% achieved
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-3 overflow-hidden">
                  <div className="flex h-full">
                    <div
                      className="bg-[#0a61d7] h-full transition-all duration-300"
                      style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                    />
                    <div
                      className="bg-orange-500 h-full transition-all duration-300"
                      style={{ width: `${Math.max(0, 100 - progressPercentage)}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-orange-500 rounded"></div>
                    <span className="text-xs text-gray-500">Target</span>
                    <span className="text-xs font-semibold text-gray-900 ml-auto">{formatCurrencyAmount(currentMonthTarget.goal)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-[#0a61d7] rounded"></div>
                    <span className="text-xs text-gray-500">Achieved</span>
                    <span className="text-xs font-semibold text-gray-900 ml-auto">{formatCurrencyAmount(currentMonthTarget.achieved)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Other Info */}
            <div className="py-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Other Info</h3>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-sm text-gray-500">Phone:</span>
                  <span className="text-sm text-gray-900 text-right">{agent.phone}</span>
                </div>
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-sm text-gray-500">Sex:</span>
                  <span className="text-sm text-gray-900 text-right">{agent.sex || '-'}</span>
                </div>
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-sm text-gray-500">Email:</span>
                  <span className="text-sm text-gray-900 text-right">{agent.email}</span>
                </div>
              </div>
            </div>

            {/* Employee Status */}
            <div className="py-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Employee Location & Status</h3>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-500">Location:</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-900">{agent.territory || '-'}</span>
                  <span
                    className={`inline-block px-3 py-1.5 rounded-full text-xs font-bold ${
                      agent.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Favourite Products to be Sold - Separate Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Favourite Product to be Sold</h3>
              </div>
            </div>
            <div className="space-y-3">
              {favoriteProducts.length > 0 ? (
                favoriteProducts.map((product) => (
                  <div key={product.productId} className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start gap-3">
                      {/* Product Image */}
                      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                        {product.images && product.images.length > 0 ? (
                          <img 
                            src={product.images[0]} 
                            alt={product.name} 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/placeholder-product.png';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                      </div>
                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 mb-1">{product.name}</p>
                        <p className="text-xs text-gray-500">{product.productType}</p>
                        {product.brand && (
                          <p className="text-xs text-gray-400 mt-1">Brand: {product.brand}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">No favorite products selected</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Detailed Information */}
        <div className="lg:col-span-2 space-y-4">
          {/* About Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">About {agent.name.split(' ')[0]}</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              {agent.bio || 'No biography available.'}
            </p>
          </div>

          {/* Daily Field Report */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Daily Field Report</h3>
            </div>
            
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600">{selectedMonth}</span>
            </div>
            

            {/* Pagination */}
            {(() => {
              const totalReportPages = Math.ceil(fieldReports.length / reportsPerPage);
              const fromReport = (reportPage - 1) * reportsPerPage + 1;
              const toReport = Math.min(reportPage * reportsPerPage, fieldReports.length);
              const paginatedReports = fieldReports.slice((reportPage - 1) * reportsPerPage, reportPage * reportsPerPage);
              
              return (
                <>
                  <div className="space-y-3">
                    {paginatedReports.map((report) => (
                      <div
                        key={report.id}
                        className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-900">{report.date}</span>
                        </div>
                        <button 
                          onClick={() => handleViewReport(report)}
                          className="text-sm text-[#0a61d7] hover:text-[#0851b8] font-medium"
                        >
                          View report
                        </button>
                      </div>
                    ))}
                  </div>

                  {fieldReports.length > 0 && (
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-2">
                      {/* Left: Showing X to Y of Z */}
                      <div className="text-sm text-gray-500">
                        Showing {fromReport} to {toReport} of {fieldReports.length}
                      </div>
                      {/* Right: Pagination Controls */}
                      <div className="flex items-center gap-3">
                        <button
                          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => setReportPage(p => Math.max(1, p - 1))}
                          disabled={reportPage === 1 || totalReportPages === 0}
                          aria-label="Previous page"
                        >
                          <ChevronLeft className="w-4 h-4 text-gray-500" />
                        </button>
                        {totalReportPages > 0 && Array.from({ length: Math.min(7, totalReportPages) }, (_, i) => {
                          let pageNum;
                          if (totalReportPages <= 7) {
                            pageNum = i + 1;
                          } else if (reportPage <= 4) {
                            pageNum = i + 1;
                          } else if (reportPage >= totalReportPages - 3) {
                            pageNum = totalReportPages - 6 + i;
                          } else {
                            pageNum = reportPage - 3 + i;
                          }
                          return (
                            <button
                              key={pageNum}
                              className={`px-3 py-2 rounded-lg font-semibold text-sm transition ${
                                pageNum === reportPage 
                                  ? 'bg-[#0a61d7] text-white' 
                                  : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
                              }`}
                              onClick={() => setReportPage(pageNum)}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                        {totalReportPages > 7 && reportPage < totalReportPages - 3 && (
                          <span className="px-2 text-gray-500">...</span>
                        )}
                        {totalReportPages > 7 && reportPage < totalReportPages - 3 && (
                          <button
                            className={`px-3 py-2 rounded-lg font-semibold text-sm transition ${
                              reportPage === totalReportPages
                                ? 'bg-[#0a61d7] text-white'
                                : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
                            }`}
                            onClick={() => setReportPage(totalReportPages)}
                          >
                            {totalReportPages}
                          </button>
                        )}
                        <button
                          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => setReportPage(p => Math.min(totalReportPages, p + 1))}
                          disabled={reportPage === totalReportPages || totalReportPages === 0}
                          aria-label="Next page"
                        >
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Sales Target */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Sales Target</h3>
            </div>
            
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600">{selectedYear}</span>
            </div>
            
            {(() => {
              const totalTargetPages = Math.ceil(salesTargets.length / targetsPerPage);
              const fromTarget = (targetPage - 1) * targetsPerPage + 1;
              const toTarget = Math.min(targetPage * targetsPerPage, salesTargets.length);
              const paginatedTargets = salesTargets.slice((targetPage - 1) * targetsPerPage, targetPage * targetsPerPage);
              
              return (
                <>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-100 border-b border-gray-200">
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Period</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Goal ({userCurrency})</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Achieved ({userCurrency})</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit Sold</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedTargets.map((target, idx) => (
                          <tr key={idx} className="border-b border-gray-100 transition-colors">
                            <td className="py-3 px-4 text-xs font-medium text-gray-900">{target.period}</td>
                            <td className="py-3 px-4 text-xs text-black text-right">{formatCurrencyAmount(target.goal)}</td>
                            <td className="py-3 px-4 text-xs text-black text-right">{formatCurrencyAmount(target.achieved)}</td>
                            <td className="py-3 px-4 text-xs text-black text-right">{target.unitsSold} Units</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {salesTargets.length > 0 && (
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-5 gap-2">
                      {/* Left: Showing X to Y of Z */}
                      <div className="text-sm text-gray-500">
                        Showing {fromTarget} to {toTarget} of {salesTargets.length}
                      </div>
                      {/* Right: Pagination Controls */}
                      <div className="flex items-center gap-3">
                        <button
                          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => setTargetPage(p => Math.max(1, p - 1))}
                          disabled={targetPage === 1 || totalTargetPages === 0}
                          aria-label="Previous page"
                        >
                          <ChevronLeft className="w-4 h-4 text-gray-500" />
                        </button>
                        {totalTargetPages > 0 && Array.from({ length: Math.min(7, totalTargetPages) }, (_, i) => {
                          let pageNum;
                          if (totalTargetPages <= 7) {
                            pageNum = i + 1;
                          } else if (targetPage <= 4) {
                            pageNum = i + 1;
                          } else if (targetPage >= totalTargetPages - 3) {
                            pageNum = totalTargetPages - 6 + i;
                          } else {
                            pageNum = targetPage - 3 + i;
                          }
                          return (
                            <button
                              key={pageNum}
                              className={`px-3 py-2 rounded-lg font-semibold text-sm transition ${
                                pageNum === targetPage 
                                  ? 'bg-[#0a61d7] text-white' 
                                  : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
                              }`}
                              onClick={() => setTargetPage(pageNum)}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                        {totalTargetPages > 7 && targetPage < totalTargetPages - 3 && (
                          <span className="px-2 text-gray-500">...</span>
                        )}
                        {totalTargetPages > 7 && targetPage < totalTargetPages - 3 && (
                          <button
                            className={`px-3 py-2 rounded-lg font-semibold text-sm transition ${
                              targetPage === totalTargetPages
                                ? 'bg-[#0a61d7] text-white'
                                : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
                            }`}
                            onClick={() => setTargetPage(totalTargetPages)}
                          >
                            {totalTargetPages}
                          </button>
                        )}
                        <button
                          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => setTargetPage(p => Math.min(totalTargetPages, p + 1))}
                          disabled={targetPage === totalTargetPages || totalTargetPages === 0}
                          aria-label="Next page"
                        >
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          </div>
        </div>
      </div>

      {/* Field Report Detail Modal */}
      {showReportModal && selectedReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={handleCloseReportModal}>
          <div 
            className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Daily Field Report</h2>
                <p className="text-sm text-gray-500 mt-1">{selectedReport.date}</p>
              </div>
              <button
                onClick={handleCloseReportModal}
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-2 transition-colors"
              >
                <X className="w-6 h-6"/>
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="p-4 overflow-y-auto max-h-[100vh]">
              <div className="space-y-4">
                {/* Time and Location */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Clock className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Working Hours</p>
                      <p className="text-sm font-medium text-gray-900">
                        {selectedReport.startTime} - {selectedReport.endTime}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <MapPin className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Location</p>
                      <p className="text-sm font-medium text-gray-900">
                        {selectedReport.location || 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Activities Summary */}
                {selectedReport.activities && (
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      Daily Activities Summary
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 bg-blue-50 rounded-lg">
                        <p className="text-2xl font-bold text-blue-600">{selectedReport.activities.visits}</p>
                        <p className="text-xs text-gray-600 mt-1">Visits</p>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <p className="text-2xl font-bold text-green-600">{selectedReport.activities.customersMet}</p>
                        <p className="text-xs text-gray-600 mt-1">Customers Met</p>
                      </div>
                      <div className="text-center p-3 bg-purple-50 rounded-lg">
                        <p className="text-2xl font-bold text-purple-600">{selectedReport.activities.productsDemonstrated}</p>
                        <p className="text-xs text-gray-600 mt-1">Products Demonstrated</p>
                      </div>
                      <div className="text-center p-3 bg-orange-50 rounded-lg">
                        <p className="text-2xl font-bold text-orange-600">{selectedReport.activities.salesMade}</p>
                        <p className="text-xs text-gray-600 mt-1">Sales Made</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes Section */}
                {selectedReport.notes && (
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Notes & Observations
                    </h3>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {selectedReport.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
