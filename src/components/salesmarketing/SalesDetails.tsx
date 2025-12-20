'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Edit, Mail, Phone, MapPin, Calendar, Eye, ChevronDown, ChevronUp, Package, X, Clock, User, Building2, Target, CheckCircle } from 'lucide-react';
import { SalesAgent } from './TeamList';
import { useUserStore } from '@/store/userStore';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';

interface SalesDetailsProps {
  agent: SalesAgent;
  onEdit?: () => void;
  onBack?: () => void;
}

interface FieldReport {
  id: string;
  date: string;
  status: 'pending' | 'reviewed';
  // Detailed report information
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
  reviewedBy?: string;
  reviewedAt?: string;
}

interface SalesTarget {
  period: string;
  goal: number;
  achieved: number;
  unitsSold: number;
}

interface FavoriteProduct {
  id: string;
  name: string;
  category: string;
  unitsSold: number;
  totalRevenue: number;
}

export default function SalesDetails({ agent, onEdit, onBack }: SalesDetailsProps) {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const [isClient, setIsClient] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['reports', 'targets']));
  const [selectedMonth, setSelectedMonth] = useState('October, 2024');
  const [selectedYear, setSelectedYear] = useState('This year (2024)');
  const [selectedReport, setSelectedReport] = useState<FieldReport | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  // Prevent hydration mismatch by only using user currency on client
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Get user currency for display (only on client)
  const userCurrency = isClient ? (user?.currency || getDefaultCurrency()) : getDefaultCurrency();

  // Sample field reports data
  const fieldReports: FieldReport[] = [
    { 
      id: '1', 
      date: '06 October, 2024', 
      status: 'pending',
      activities: {
        visits: 8,
        customersMet: 6,
        productsDemonstrated: 12,
        salesMade: 4
      },
      notes: 'Visited several retail stores in Jakarta area. Focused on promoting new product line. Received positive feedback from 3 potential buyers.',
      location: 'Jakarta & West Java',
      startTime: '08:00',
      endTime: '17:30',
    },
    { 
      id: '2', 
      date: '05 October, 2024', 
      status: 'reviewed',
      activities: {
        visits: 10,
        customersMet: 8,
        productsDemonstrated: 15,
        salesMade: 6
      },
      notes: 'Excellent day with high customer engagement. Successfully closed 6 deals including 2 large orders. Follow-up scheduled for next week.',
      location: 'Jakarta & West Java',
      startTime: '08:15',
      endTime: '18:00',
      reviewedBy: 'Manager John Doe',
      reviewedAt: '05 October, 2024 19:30'
    },
    { 
      id: '3', 
      date: '04 October, 2024', 
      status: 'reviewed',
      activities: {
        visits: 7,
        customersMet: 5,
        productsDemonstrated: 10,
        salesMade: 3
      },
      notes: 'Regular field visit to maintain relationships with existing clients. Discussed upcoming promotions and seasonal products.',
      location: 'Jakarta & West Java',
      startTime: '09:00',
      endTime: '16:45',
      reviewedBy: 'Manager John Doe',
      reviewedAt: '04 October, 2024 18:00'
    },
    { 
      id: '4', 
      date: '03 October, 2024', 
      status: 'reviewed',
      activities: {
        visits: 9,
        customersMet: 7,
        productsDemonstrated: 14,
        salesMade: 5
      },
      notes: 'Productive day visiting new prospects. Introduced premium product line to 3 new potential clients. One client showed strong interest.',
      location: 'Jakarta & West Java',
      startTime: '08:30',
      endTime: '17:15',
      reviewedBy: 'Manager John Doe',
      reviewedAt: '03 October, 2024 18:30'
    },
    { 
      id: '5', 
      date: '02 October, 2024', 
      status: 'reviewed',
      activities: {
        visits: 6,
        customersMet: 4,
        productsDemonstrated: 8,
        salesMade: 2
      },
      notes: 'Focused on follow-up visits with existing customers. Collected feedback on product quality and delivery service.',
      location: 'Jakarta & West Java',
      startTime: '09:30',
      endTime: '16:00',
      reviewedBy: 'Manager John Doe',
      reviewedAt: '02 October, 2024 17:00'
    },
  ];

  // Sample sales targets data
  const salesTargets: SalesTarget[] = [
    { period: 'October', goal: 200000000, achieved: 170000000, unitsSold: 230 },
    { period: 'September', goal: 200000000, achieved: 180000000, unitsSold: 250 },
    { period: 'August', goal: 200000000, achieved: 190000000, unitsSold: 270 },
    { period: 'July', goal: 200000000, achieved: 175000000, unitsSold: 240 },
  ];

  // Sample favorite products data
  const favoriteProducts: FavoriteProduct[] = [
    { id: '1', name: 'Premium Rice 5kg', category: 'Food & Beverages', unitsSold: 145, totalRevenue: 43500000 },
    { id: '2', name: 'Cooking Oil 2L', category: 'Food & Beverages', unitsSold: 98, totalRevenue: 29400000 },
    { id: '3', name: 'Instant Noodles Pack', category: 'Food & Beverages', unitsSold: 87, totalRevenue: 26100000 },
  ];

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.push('/marketing/team');
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
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

  const currentMonthTarget = salesTargets[0];
  const progressPercentage = agent.salesTarget && agent.currentSales
    ? getProgressPercentage(agent.currentSales, agent.salesTarget)
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
            <div className="flex flex-col items-center mb-6">
              <div className="relative mb-4">
                <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center">
                  <span className="text-2xl font-medium text-gray-600">
                    {agent.name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                {onEdit && (
                  <button
                    onClick={onEdit}
                    className="absolute bottom-0 right-0 w-8 h-8 bg-[#0a61d7] rounded-full flex items-center justify-center border-2 border-white hover:bg-[#0851b8] transition-colors"
                  >
                    <Edit className="w-4 h-4 text-white" />
                  </button>
                )}
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">{agent.name}</h2>
              <p className="text-sm text-gray-600">{agent.role}</p>
            </div>

            {/* Sales Target Summary */}
            {agent.salesTarget && agent.currentSales && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">October sales target</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {Math.round((agent.currentSales / agent.salesTarget) * 100)}% achieved
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
                  <div
                    className="bg-[#0a61d7] h-3 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Target {formatCurrencyAmount(agent.salesTarget)}</span>
                  <span>Achieved {formatCurrencyAmount(agent.currentSales)}</span>
                </div>
              </div>
            )}

            {/* Other Info */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">Other Info</h3>
                {onEdit && (
                  <button onClick={onEdit} className="p-1 hover:bg-gray-100 rounded transition-colors">
                    <Edit className="w-3 h-3 text-gray-600" />
                  </button>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">{agent.phone}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">Sex:</span>
                  <span className="text-sm text-gray-900">-</span>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">{agent.email}</span>
                </div>
              </div>
            </div>

            {/* Employee Status */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">Employee Status</h3>
                {onEdit && (
                  <button onClick={onEdit} className="p-1 hover:bg-gray-100 rounded transition-colors">
                    <Edit className="w-3 h-3 text-gray-600" />
                  </button>
                )}
              </div>
              <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${
                agent.status === 'active'
                  ? 'bg-green-100 text-green-500'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
              </span>
            </div>

            {/* Location */}
            {agent.territory && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">Location</h3>
                </div>
                <p className="text-sm text-gray-600 ml-6">{agent.territory}</p>
              </div>
            )}
          </div>

          {/* Favourite Products to be Sold - Separate Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Favourite Product to be Sold</h3>
              </div>
              {onEdit && (
                <button onClick={onEdit} className="p-1 hover:bg-gray-100 rounded transition-colors">
                  <Edit className="w-3 h-3 text-gray-600" />
                </button>
              )}
            </div>
            <div className="space-y-3">
              {favoriteProducts.map((product) => (
                <div key={product.id} className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 mb-1">{product.name}</p>
                      <p className="text-xs text-gray-500">{product.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-600 mt-2 pt-2 border-t border-gray-100">
                    <span>{product.unitsSold} units sold</span>
                    <span className="font-semibold text-gray-900">{formatCurrencyAmount(product.totalRevenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Detailed Information */}
        <div className="lg:col-span-2 space-y-4">
          {/* About Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">About {agent.name.split(' ')[0]}</h3>
              {onEdit && (
                <button onClick={onEdit} className="p-1 hover:bg-gray-100 rounded transition-colors">
                  <Edit className="w-4 h-4 text-gray-600" />
                </button>
              )}
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. 
              Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
            </p>
          </div>

          {/* Daily Field Report */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <button
              onClick={() => toggleSection('reports')}
              className="flex items-center justify-between w-full mb-4"
            >
              <h3 className="text-lg font-semibold text-gray-900">Daily Field Report</h3>
              {expandedSections.has('reports') ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>
            
            {expandedSections.has('reports') && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">{selectedMonth}</span>
                </div>
                
                <div className="space-y-3">
                  {fieldReports.map((report) => (
                    <div
                      key={report.id}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          report.status === 'reviewed' ? 'bg-green-500' : 'bg-gray-400'
                        }`} />
                        <span className="text-sm text-gray-900">{report.date}</span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          report.status === 'reviewed'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-50 text-gray-700'
                        }`}>
                          {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                        </span>
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

                {/* Pagination */}
                <div className="flex items-center justify-center gap-2 mt-6">
                  <button className="px-3 py-1 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">
                    1
                  </button>
                  <button className="px-3 py-1 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">
                    2
                  </button>
                  <button className="px-3 py-1 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">
                    3
                  </button>
                  <button className="px-3 py-1 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">
                    4
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-400">...</span>
                </div>
              </>
            )}
          </div>

          {/* Sales Target */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <button
              onClick={() => toggleSection('targets')}
              className="flex items-center justify-between w-full mb-4"
            >
              <h3 className="text-lg font-semibold text-gray-900">Sales Target</h3>
              {expandedSections.has('targets') ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>
            
            {expandedSections.has('targets') && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">{selectedYear}</span>
                </div>
                
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
                      {salesTargets.map((target, idx) => (
                        <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4 text-xs font-medium text-gray-900">{target.period}</td>
                          <td className="py-3 px-4 text-xs text-black text-right">{formatCurrencyAmount(target.goal)}</td>
                          <td className="py-3 px-4 text-xs text-black text-right">{formatCurrencyAmount(target.achieved)}</td>
                          <td className="py-3 px-4 text-xs text-black text-right">{target.unitsSold} Units</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
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
                {/* Status Badge */}
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${
                    selectedReport.status === 'reviewed'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {selectedReport.status === 'reviewed' && <CheckCircle className="w-4 h-4" />}
                    {selectedReport.status.charAt(0).toUpperCase() + selectedReport.status.slice(1)}
                  </span>
                  {selectedReport.reviewedBy && (
                    <span className="text-sm text-gray-500">
                      Reviewed by {selectedReport.reviewedBy} on {selectedReport.reviewedAt}
                    </span>
                  )}
                </div>

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

                {/* Agent Info */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Building2 className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Reported by</p>
                    <p className="text-sm font-medium text-gray-900">{agent.name}</p>
                    <p className="text-xs text-gray-500">{agent.role}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
