'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw, Download, Plus, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import TeamList from '@/components/salesmarketing/TeamList';
import { SalesAgent, SalesTeam } from '@/components/salesmarketing/TeamList';

function downloadXLSX(wb: XLSX.WorkBook, filename: string) {
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

export default function MarketingTeamPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
  const [salesTeams, setSalesTeams] = useState<SalesTeam[]>([]);
  
  // Enhanced state management for overlay animations
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState('');
  const [isSlidingIn, setIsSlidingIn] = useState(false);
  const [isSlidingOut, setIsSlidingOut] = useState(false);
  const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    
    // Clear any existing timeouts
    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
    }
    
    // Always start slide-in animation when refresh is clicked
    setIsSlidingOut(false);
    setIsSlidingIn(true);
    setOverlayMessage('Refreshing team data');
    
    // In production, fetch from API
    // For now, using empty arrays - TeamList will use default sample data
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // In production, replace with actual API call:
      // const data = await fetchGraphQL(...);
      // setSalesAgents(data.agents);
      // setSalesTeams(data.teams);
      
      // Calculate total count - only count agents
      // Since TeamList uses default data when empty, we need to count those defaults
      const agentCount = salesAgents.length > 0 ? salesAgents.length : 4;
      
      setOverlayMessage(`Showing team data (${agentCount} sales agents loaded)`);
    } catch (error) {
      console.error('Error fetching team data:', error);
      setOverlayMessage('Error loading teams');
    } finally {
      setLoading(false);
      
      // Complete slide-in animation and show overlay
      setTimeout(() => {
        setIsSlidingIn(false);
        setShowOverlay(true);
      }, 1500);
      
      // Auto-hide overlay after 2.5 seconds
      overlayTimeoutRef.current = setTimeout(() => {
        // Start slide-out animation
        setIsSlidingOut(true);
        setShowOverlay(false);
        
        // Remove overlay completely after animation
        setTimeout(() => {
          setIsSlidingOut(false);
        }, 500);
      }, 2500);
    }
  }, [salesAgents.length, salesTeams.length]);

  useEffect(() => {
    // Start slide-in animation immediately for initial page load
    setIsSlidingIn(true);
    setOverlayMessage('Loading team data...');
    
    fetchData();
    
    // Cleanup timeout on unmount
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, []);

  const handleViewAgent = (agent: SalesAgent) => {
    router.push(`/marketing/team/details?id=${agent.id}`);
  };

  const handleCreateAgent = () => {
    // Navigate to create agent page or open modal
    console.log('Create new agent');
    // router.push('/marketing/team/create');
  };

  const handleEditAgent = (agent: SalesAgent) => {
    // Navigate to edit agent page or open modal
    console.log('Edit agent:', agent.id);
    // router.push(`/marketing/team/edit?id=${agent.id}`);
  };

  const handleDeleteAgent = (agentId: string) => {
    // Handle delete agent
    if (confirm('Are you sure you want to delete this agent?')) {
      setSalesAgents(prev => prev.filter(agent => agent.id !== agentId));
      console.log('Delete agent:', agentId);
    }
  };

  const handleEditTeam = (team: SalesTeam) => {
    // Handle edit team
    console.log('Edit team:', team.id);
  };

  const handleCreateTeam = () => {
    // Handle create team
    console.log('Create new team');
  };

  const handleExport = () => {
    // Get all agents (use default if empty)
    const agents = salesAgents.length > 0 ? salesAgents : [
      {
        id: '1',
        name: 'Sarah Johnson',
        email: 'sarah.johnson@laku.com',
        phone: '+62 21 1234 5678',
        role: 'Sales Manager',
        status: 'active',
        territory: 'Jakarta & West Java',
        salesTarget: 50000000,
        currentSales: 42000000,
      },
      {
        id: '2',
        name: 'Michael Chen',
        email: 'michael.chen@laku.com',
        phone: '+62 21 2345 6789',
        role: 'Sales Rep',
        status: 'active',
        territory: 'Surabaya & East Java',
        salesTarget: 30000000,
        currentSales: 28000000,
      },
      {
        id: '3',
        name: 'Lisa Rodriguez',
        email: 'lisa.rodriguez@laku.com',
        phone: '+62 21 3456 7890',
        role: 'Lead Gen',
        status: 'inactive',
        territory: 'Bali & Nusa Tenggara',
        salesTarget: 20000000,
        currentSales: 0,
      },
      {
        id: '4',
        name: 'David Kim',
        email: 'david.kim@laku.com',
        phone: '+62 21 4567 8901',
        role: 'Account Manager',
        status: 'active',
        territory: 'Medan & North Sumatra',
        salesTarget: 40000000,
        currentSales: 35000000,
      },
    ];

    // Export agents data to XLSX
    const headers = ['Name', 'Email', 'Phone', 'Role', 'Status', 'Territory', 'Sales Target', 'Current Sales'];
    const rows = agents.map(agent => [
      agent.name,
      agent.email,
      agent.phone,
      agent.role,
      agent.status,
      agent.territory || 'N/A',
      agent.salesTarget || 0,
      agent.currentSales || 0,
    ]);
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Agents');
    
    // Generate filename with current date
    const currentDate = new Date().toISOString().split('T')[0];
    const filename = `sales_agents_export_${currentDate}.xlsx`;
    
    downloadXLSX(wb, filename);
  };

  if (loading) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading team...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Marketing Team</h1>
          <p className="text-sm text-gray-500 mb-4">Manage your marketing team members and roles</p>
        </div>
        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Refresh Button */}
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <RefreshCcw className="w-4 h-4" />
            Refresh
          </button>

          {/* Export Button */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export Data
          </button>

          {/* Add Agents Button */}
          <button
            onClick={handleCreateAgent}
            className="flex items-center gap-2 px-6 py-2 bg-[#0a61d7] font-semibold text-white rounded-lg hover:bg-[#0851b8] transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Agent
          </button>
        </div>
      </div>

      {/* Data Status Overlay */}
      {(showOverlay || isSlidingIn || isSlidingOut) && (
        <div className={`fixed top-20 right-6 z-50 bg-white border border-green-300 rounded-lg shadow-lg p-4 min-w-[280px] transform transition-all duration-500 ease-out ${
          isSlidingIn ? 'translate-x-0 opacity-100' : 
          isSlidingOut ? 'translate-x-full opacity-0' : 
          'translate-x-full opacity-0'
        }`}>
          <div className="flex items-center gap-3">
            {loading ? (
              <div className="w-5 h-5 border-2 border-[#0a61d7] border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">{overlayMessage}</p>
              <p className="text-xs text-gray-500">
                {loading ? 'Please wait...' : (() => {
                  const agentCount = salesAgents.length > 0 ? salesAgents.length : 4;
                  return `${agentCount} sales agent${agentCount !== 1 ? 's' : ''} loaded`;
                })()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Team List Component */}
      <TeamList
        salesAgents={salesAgents}
        salesTeams={salesTeams}
        onViewAgent={handleViewAgent}
        onEditAgent={handleEditAgent}
        onDeleteAgent={handleDeleteAgent}
        onEditTeam={handleEditTeam}
        onCreateTeam={handleCreateTeam}
      />
    </div>
  );
}
