'use client';
import FinancialAnalytics from '@/components/analyticsperformance/FinancialAnalytics';
import { Calendar, ChevronDown, Download, Filter } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export default function FinancialAnalyticsPage() {
  const [timeRange, setTimeRange] = useState('1M');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const timeRanges = [
    { value: '1M', label: 'Last Month' },
    { value: '3M', label: 'Last 3 Months' },
    { value: '6M', label: 'Last 6 Months' },
    { value: '1Y', label: 'Last Year' }
  ];

  const currentRange = timeRanges.find(range => range.value === timeRange);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Financial Analytics</h1>
          <p className="text-sm text-gray-500 mb-4">Comprehensive financial overview and insights</p>
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Time Range Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              <Calendar className="w-4 h-4" />
              {currentRange?.label}
              <ChevronDown className="w-4 h-4" />
            </button>
            
            {isDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-full bg-white border border-[#e6e6e6] rounded-lg shadow-lg z-10">
                {timeRanges.map((range) => (
                  <button
                    key={range.value}
                    onClick={() => {
                      setTimeRange(range.value);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                      timeRange === range.value ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export Button */}
          <button className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] border border-[#e6e6e6] text-white rounded-lg hover:bg-[#084ba6] transition-colors text-sm font-medium">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>


        <FinancialAnalytics />
    </div>
  )

}
