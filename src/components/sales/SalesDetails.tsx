'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Edit, Mail, Phone, MapPin, Calendar, Eye, Package, X, Clock, User, Building2, Target, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { SalesAgent } from './TeamList';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { formatDateLong } from '@/utils/dateUtils';
import { useSalesTranslations } from '@/hooks/useSalesTranslations';

interface SalesDetailsProps {
  agent: SalesAgent;
  onEdit?: () => void;
  onBack?: () => void;
}

interface FieldReport {
  id: string;
  date: string;
  dateKey?: string;
  activities?: {
    visits: number;
    customersMet: number;
    productsDemonstrated: number;
    salesMade: number;
    manualOverride?: boolean;
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

type JobDay = { date: string; visits: number; customersMet: number; productsDemonstrated: number; salesMade: number };

function jobDateKey(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
}

function periodIncludesDate(period: string, dateKey: string): boolean {
  const [yearText, monthText] = dateKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month) return false;
  const monthEn = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }).toLowerCase();
  const monthId = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'][month - 1];
  const normalized = period.toLowerCase();
  const yearMatch = normalized.match(/20\d{2}/);
  if (!yearMatch || Number(yearMatch[0]) !== year) return false;
  if (normalized.includes(monthEn) || normalized.includes(monthId)) return true;
  const quarter = Math.floor((month - 1) / 3) + 1;
  return normalized.includes(`q${quarter}`);
}

export default function SalesDetails({ agent, onEdit, onBack }: SalesDetailsProps) {
  const { tSalesDetails, translateAgentRole, translateAgentStatus, tShared } = useSalesTranslations();
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const [selectedMonth] = useState('October, 2024');
  const [selectedYear] = useState('This year (2024)');
  const [selectedReport, setSelectedReport] = useState<FieldReport | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportPage, setReportPage] = useState(1);
  const reportsPerPage = 5;
  const [targetPage, setTargetPage] = useState(1);
  const targetsPerPage = 4;
  const [jobDays, setJobDays] = useState<Record<string, JobDay>>({});

  useEffect(() => {
    if (!user?.id || !agent.id) return;
    fetchGraphQL<{ salesJobDayAggregates: JobDay[] }>(
      `query JobDays($userId: Int!, $agentId: String!) {
        salesJobDayAggregates(userId: $userId, agentId: $agentId) {
          date visits customersMet productsDemonstrated salesMade
        }
      }`,
      { userId: user.id, agentId: agent.id },
    )
      .then((data) => {
        const next: Record<string, JobDay> = {};
        for (const row of data.salesJobDayAggregates) next[row.date] = row;
        setJobDays(next);
      })
      .catch(() => setJobDays({}));
  }, [user?.id, agent.id]);

  // Get user currency for display - safe to use on both server and client
  const userCurrency = user?.currency || getDefaultCurrency();

  // Use field reports from agent data, format dates properly
  const fieldReports: FieldReport[] = (agent.fieldReports || []).map(report => ({
    id: report.id,
    date: formatDateLong(report.date) || report.date,
    dateKey: jobDateKey(report.date),
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

  const displayReports: FieldReport[] = (() => {
    const rows = new Map<string, FieldReport>();
    for (const report of fieldReports) {
      const key = report.dateKey || report.id;
      const agg = report.dateKey ? jobDays[report.dateKey] : undefined;
      if (agg && !report.activities?.manualOverride) rows.set(key, { ...report, activities: { ...agg } });
      else rows.set(key, report);
    }
    for (const [key, agg] of Object.entries(jobDays)) {
      if (!rows.has(key)) rows.set(key, { id: `jobs-${key}`, date: formatDateLong(key) || key, dateKey: key, activities: agg });
    }
    return Array.from(rows.values()).sort((a, b) => (b.dateKey || '').localeCompare(a.dateKey || ''));
  })();

  const achievedAmount = (target: SalesTarget) => {
    const fromJobs = Object.entries(jobDays).reduce(
      (sum, [date, row]) => (periodIncludesDate(target.period, date) ? sum + row.salesMade : sum),
      0,
    );
    return fromJobs + target.achieved;
  };

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
      router.push('/sales/team');
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
    ? getProgressPercentage(achievedAmount(currentMonthTarget), currentMonthTarget.goal)
    : 0;

  return (
    <div className="bg-white p-4 rounded-lg border border-[#e6e6e6]">
      <div className="w-full mx-auto">
        {/* Breadcrumb Navigation */}
        <div className="mb-4 flex min-w-0 flex-col gap-3 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
          <div className="flex min-w-0 flex-col gap-3 @3xl/main:flex-row @3xl/main:items-center">
            <button
              onClick={handleBack}
              className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 @3xl/main:w-auto @3xl/main:justify-start"
            >
              <ArrowLeft className="h-4 w-4" />
              {tSalesDetails('backToTeamList')}
            </button>
            <h1 className="min-w-0 truncate text-2xl font-bold text-gray-900">{agent.name}</h1>
          </div>
          {onEdit && (
            <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @5xl/main:w-auto">
              <button
                onClick={onEdit}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0851b8] @4xl/main:w-auto"
              >
                <Edit className="h-4 w-4" />
                {tSalesDetails('editDetails')}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 @5xl/main:grid-cols-3 @5xl/main:items-stretch">
          {/* Left Column - Profile Summary; fill height to match right column */}
          <div className="flex min-h-0 flex-col gap-4 @5xl/main:col-span-1">
          {/* Profile Card */}
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 flex-shrink-0">
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
              <p className="text-sm text-gray-600">{translateAgentRole(agent.role)}</p>
            </div>

            {/* Sales Target Summary */}
            {currentMonthTarget && (
              <div className="py-4 border-b border-[#e6e6e6]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">{tSalesDetails('salesTargetLabel', { period: currentMonthTarget.period })}</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {tSalesDetails('achievedPercent', { percent: Math.round(progressPercentage) })}
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
                    <span className="text-xs text-gray-500">{tSalesDetails('target')}</span>
                    <span className="text-xs font-semibold text-gray-900 ml-auto">{formatCurrencyAmount(currentMonthTarget.goal)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-[#0a61d7] rounded"></div>
                    <span className="text-xs text-gray-500">{tSalesDetails('achieved')}</span>
                    <span className="text-xs font-semibold text-gray-900 ml-auto">{formatCurrencyAmount(achievedAmount(currentMonthTarget))}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Other Info */}
            <div className="py-4 border-b border-[#e6e6e6]">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">{tSalesDetails('otherInfo')}</h3>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-sm text-gray-500">{tSalesDetails('phone')}</span>
                  <span className="text-sm text-gray-900 text-right">{agent.phone}</span>
                </div>
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-sm text-gray-500">{tSalesDetails('sex')}</span>
                  <span className="text-sm text-gray-900 text-right">{agent.sex || '-'}</span>
                </div>
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-sm text-gray-500">{tSalesDetails('email')}</span>
                  <span className="text-sm text-gray-900 text-right">{agent.email}</span>
                </div>
              </div>
            </div>

            {/* Employee Status */}
            <div className="py-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">{tSalesDetails('employeeLocationStatus')}</h3>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-500">{tSalesDetails('location')}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-900">{agent.territory || '-'}</span>
                  <span
                    className={`inline-block px-3 py-1.5 rounded-full text-xs font-bold ${
                      agent.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {translateAgentStatus(agent.status)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Favourite Products to be Sold - grows to fill remaining left column height */}
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">{tSalesDetails('favouriteProducts')}</h3>
              </div>
            </div>
            <div className="space-y-3 flex-shrink-0">
              {favoriteProducts.length > 0 ? (
                favoriteProducts.map((product) => (
                  <div key={product.productId} className="border border-[#e6e6e6] rounded-lg p-3 hover:bg-gray-50 transition-colors">
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
                          <p className="text-xs text-gray-400 mt-1">{tSalesDetails('brand', { brand: product.brand })}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">{tSalesDetails('noFavoriteProducts')}</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Detailed Information */}
        <div className="flex min-h-0 flex-col gap-4 @5xl/main:col-span-2">
          {/* About Section */}
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{tSalesDetails('about', { name: agent.name.split(' ')[0] })}</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              {agent.bio || tSalesDetails('noBiography')}
            </p>
          </div>

          {/* Daily Field Report */}
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{tSalesDetails('dailyFieldReport')}</h3>
              {Object.keys(jobDays).length > 0 && (
                <p className="text-xs text-gray-500 mt-1">{tSalesDetails('fromCompletedJobs')}</p>
              )}
            </div>
            
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600">{tSalesDetails('filters.defaultMonth')}</span>
            </div>
            

            {/* Pagination */}
            {(() => {
              const totalReportPages = Math.ceil(displayReports.length / reportsPerPage);
              const fromReport = (reportPage - 1) * reportsPerPage + 1;
              const toReport = Math.min(reportPage * reportsPerPage, displayReports.length);
              const paginatedReports = displayReports.slice((reportPage - 1) * reportsPerPage, reportPage * reportsPerPage);
              
              return (
                <>
                  <div className="space-y-3">
                    {paginatedReports.map((report) => (
                      <div
                        key={report.id}
                        className="flex items-center justify-between p-3 border border-[#e6e6e6] rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-900">{report.date}</span>
                        </div>
                        <button 
                          onClick={() => handleViewReport(report)}
                          className="text-sm text-[#0a61d7] hover:text-[#0851b8] font-medium"
                        >
                          {tSalesDetails('viewReport')}
                        </button>
                      </div>
                    ))}
                  </div>

                  {displayReports.length > 0 && (
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-2">
                      {/* Left: Showing X to Y of Z */}
                      <div className="text-sm text-gray-500">
                        {tSalesDetails('pagination.showing', { from: fromReport, to: toReport, total: displayReports.length })}
                      </div>
                      {/* Right: Pagination Controls */}
                      <div className="flex items-center gap-3">
                        <button
                          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => setReportPage(p => Math.max(1, p - 1))}
                          disabled={reportPage === 1 || totalReportPages === 0}
                          aria-label={tSalesDetails('previousPage')}
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
                          aria-label={tSalesDetails('nextPage')}
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
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{tSalesDetails('salesTarget')}</h3>
              {Object.keys(jobDays).length > 0 && (
                <p className="text-xs text-gray-500 mt-1">{tSalesDetails('fromCompletedJobs')}</p>
              )}
            </div>
            
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600">{tSalesDetails('filters.defaultYear')}</span>
            </div>
            
            {(() => {
              const totalTargetPages = Math.ceil(salesTargets.length / targetsPerPage);
              const fromTarget = (targetPage - 1) * targetsPerPage + 1;
              const toTarget = Math.min(targetPage * targetsPerPage, salesTargets.length);
              const paginatedTargets = salesTargets.slice((targetPage - 1) * targetsPerPage, targetPage * targetsPerPage);
              
              return (
                <>
                  <div className="overflow-x-auto rounded-lg border border-[#e6e6e6]">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-100 border-b border-[#e6e6e6]">
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tSalesDetails('columns.period')}</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tSalesDetails('columns.goal', { currency: userCurrency })}</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tSalesDetails('columns.achieved', { currency: userCurrency })}</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tSalesDetails('columns.unitsSold')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedTargets.map((target, idx) => (
                          <tr key={idx} className="border-b border-[#e6e6e6] transition-colors">
                            <td className="py-3 px-4 text-xs font-medium text-gray-900">{target.period}</td>
                            <td className="py-3 px-4 text-xs text-black text-right">{formatCurrencyAmount(target.goal)}</td>
                            <td className="py-3 px-4 text-xs text-black text-right">{formatCurrencyAmount(achievedAmount(target))}</td>
                            <td className="py-3 px-4 text-xs text-black text-right">{target.unitsSold} {tSalesDetails('units')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {salesTargets.length > 0 && (
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-5 gap-2">
                      {/* Left: Showing X to Y of Z */}
                      <div className="text-sm text-gray-500">
                        {tSalesDetails('pagination.showing', { from: fromTarget, to: toTarget, total: salesTargets.length })}
                      </div>
                      {/* Right: Pagination Controls */}
                      <div className="flex items-center gap-3">
                        <button
                          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => setTargetPage(p => Math.max(1, p - 1))}
                          disabled={targetPage === 1 || totalTargetPages === 0}
                          aria-label={tSalesDetails('previousPage')}
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
                          aria-label={tSalesDetails('nextPage')}
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
            <div className="flex items-center justify-between p-4 border-b border-[#e6e6e6]">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{tSalesDetails('reportModalTitle')}</h2>
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
                      <p className="text-xs text-gray-500">{tSalesDetails('workingHours')}</p>
                      <p className="text-sm font-medium text-gray-900">
                        {selectedReport.startTime} - {selectedReport.endTime}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <MapPin className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">{tSalesDetails('location')}</p>
                      <p className="text-sm font-medium text-gray-900">
                        {selectedReport.location || tShared('notAvailable')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Activities Summary */}
                {selectedReport.activities && (
                  <div className="border border-[#e6e6e6] rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      {tSalesDetails('dailyActivitiesSummary')}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 bg-blue-50 rounded-lg">
                        <p className="text-2xl font-bold text-blue-600">{selectedReport.activities.visits}</p>
                        <p className="text-xs text-gray-600 mt-1">{tSalesDetails('visits')}</p>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <p className="text-2xl font-bold text-green-600">{selectedReport.activities.customersMet}</p>
                        <p className="text-xs text-gray-600 mt-1">{tSalesDetails('customersMet')}</p>
                      </div>
                      <div className="text-center p-3 bg-purple-50 rounded-lg">
                        <p className="text-2xl font-bold text-purple-600">{selectedReport.activities.productsDemonstrated}</p>
                        <p className="text-xs text-gray-600 mt-1">{tSalesDetails('productsDemonstrated')}</p>
                      </div>
                      <div className="text-center p-3 bg-orange-50 rounded-lg">
                        <p className="text-2xl font-bold text-orange-600">{selectedReport.activities.salesMade}</p>
                        <p className="text-xs text-gray-600 mt-1">{tSalesDetails('salesMade')}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes Section */}
                {selectedReport.notes && (
                  <div className="border border-[#e6e6e6] rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      {tSalesDetails('notesObservations')}
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
