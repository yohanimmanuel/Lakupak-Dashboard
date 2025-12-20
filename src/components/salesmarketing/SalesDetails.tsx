'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Edit, Mail, Phone, MapPin, Calendar, Eye, ChevronDown, ChevronUp } from 'lucide-react';
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
}

interface SalesTarget {
  period: string;
  goal: number;
  achieved: number;
  unitsSold: number;
}

export default function SalesDetails({ agent, onEdit, onBack }: SalesDetailsProps) {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const [isClient, setIsClient] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['reports', 'targets']));
  const [selectedMonth, setSelectedMonth] = useState('October, 2024');
  const [selectedYear, setSelectedYear] = useState('This year (2024)');

  // Prevent hydration mismatch by only using user currency on client
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Get user currency for display (only on client)
  const userCurrency = isClient ? (user?.currency || getDefaultCurrency()) : getDefaultCurrency();

  // Sample field reports data
  const fieldReports: FieldReport[] = [
    { id: '1', date: '06 October, 2024', status: 'pending' },
    { id: '2', date: '05 October, 2024', status: 'reviewed' },
    { id: '3', date: '04 October, 2024', status: 'reviewed' },
    { id: '4', date: '03 October, 2024', status: 'reviewed' },
    { id: '5', date: '02 October, 2024', status: 'reviewed' },
  ];

  // Sample sales targets data
  const salesTargets: SalesTarget[] = [
    { period: 'October', goal: 200000000, achieved: 170000000, unitsSold: 230 },
    { period: 'September', goal: 200000000, achieved: 180000000, unitsSold: 250 },
    { period: 'August', goal: 200000000, achieved: 190000000, unitsSold: 270 },
    { period: 'July', goal: 200000000, achieved: 175000000, unitsSold: 240 },
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
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">Location</h3>
                </div>
                <p className="text-sm text-gray-600 ml-6">{agent.territory}</p>
              </div>
            )}
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
                      <button className="text-sm text-[#0a61d7] hover:text-[#0851b8] font-medium">
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
    </div>
  );
}
