'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw, Download, Plus, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import TeamList from '@/components/salesmarketing/TeamList';
import { SalesAgent, SalesTeam } from '@/components/salesmarketing/TeamList';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import type { SalesAgentConnection, SalesTeamConnection } from '@/types/sales';
import { useMarketingTranslations } from '@/hooks/useMarketingTranslations';

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

const SALES_AGENTS_QUERY = `
  query GetSalesAgents($userId: Int!, $page: Int, $limit: Int, $search: String, $role: String, $status: String) {
    salesAgents(userId: $userId, page: $page, limit: $limit, search: $search, role: $role, status: $status) {
      nodes {
        id
        name
        email
        phone
        role
        status
        avatar
        territory
        teamId
        teamName
        userId
        favoriteProducts {
          productId
          name
          productType
          brand
          images
          sellingPrice
        }
        createdAt
        updatedAt
      }
      pagination {
        page
        limit
        totalCount
        totalPages
      }
    }
  }
`;

const SALES_TEAMS_QUERY = `
  query GetSalesTeams($userId: Int!, $page: Int, $limit: Int, $search: String) {
    salesTeams(userId: $userId, page: $page, limit: $limit, search: $search) {
      nodes {
        id
        name
        memberIds
        members {
          id
          name
          email
          phone
          role
          status
          avatar
          territory
          teamId
          teamName
        }
        userId
        createdAt
        updatedAt
      }
      pagination {
        page
        limit
        totalCount
        totalPages
      }
    }
  }
`;

export default function MarketingTeamPage() {
  const { tTeam, tShared } = useMarketingTranslations();
  const router = useRouter();
  const user = useUserStore(state => state.user);
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
    if (!user?.id) {
      setSalesAgents([]);
      setSalesTeams([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    // Clear any existing timeouts
    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
    }
    
    // Always start slide-in animation when refresh is clicked
    setIsSlidingOut(false);
    setIsSlidingIn(true);
    setOverlayMessage(tTeam('overlayRefreshing'));
    
    try {
      const [agentsData, teamsData] = await Promise.all([
        fetchGraphQL<{ salesAgents: SalesAgentConnection }>(SALES_AGENTS_QUERY, {
          userId: user.id,
          page: 1,
          limit: 1000,
        }),
        fetchGraphQL<{ salesTeams: SalesTeamConnection }>(SALES_TEAMS_QUERY, {
          userId: user.id,
          page: 1,
          limit: 1000,
        }),
      ]);

      const agents = agentsData.salesAgents?.nodes || [];
      const teams = teamsData.salesTeams?.nodes || [];

      setSalesAgents(agents);
      setSalesTeams(teams);
      
      const agentCount = agents.length;
      setOverlayMessage(tTeam('overlayLoaded', { count: agentCount }));
    } catch (error) {
      console.error('Error fetching team data:', error);
      setOverlayMessage(tTeam('overlayError'));
      setSalesAgents([]);
      setSalesTeams([]);
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
  }, [user?.id, tTeam]);

  useEffect(() => {
    // Start slide-in animation immediately for initial page load
    setIsSlidingIn(true);
    setOverlayMessage(tTeam('overlayLoading'));
    
    fetchData();
    
    // Cleanup timeout on unmount
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, [fetchData]); // fetchData is memoized with useCallback and depends on user?.id

  const handleViewAgent = (agent: SalesAgent) => {
    router.push(`/marketing/team/details?id=${agent.id}`);
  };

  const handleCreateAgent = () => {
    router.push('/marketing/team/create');
  };

  const handleEditAgent = (agent: SalesAgent) => {
    // Navigate to edit agent page
    router.push(`/marketing/team/edit?id=${agent.id}`);
  };

  const handleDeleteAgent = async (agentId: string) => {
    if (!user?.id) return;

    const DELETE_AGENT_MUTATION = `
      mutation DeleteSalesAgent($userId: Int!, $id: String!) {
        deleteSalesAgent(userId: $userId, id: $id) {
          success
        }
      }
    `;

    await fetchGraphQL(DELETE_AGENT_MUTATION, {
      userId: user.id,
      id: agentId,
    });
  };

  const handleEditTeam = async (team: SalesTeam) => {
    // This will be handled by the TeamList modal
    // Just refresh data after edit
    await fetchData();
  };

  const handleCreateTeam = async () => {
    // This will be handled by the TeamList modal
    // Just refresh data after create
    await fetchData();
  };

  const handleExport = () => {
    if (salesAgents.length === 0) {
      alert(tTeam('noAgentsToExport'));
      return;
    }

    // Export agents data to XLSX
    const headers = [
      tShared('exportColumns.name'),
      tShared('exportColumns.email'),
      tShared('exportColumns.phone'),
      tShared('exportColumns.role'),
      tShared('exportColumns.status'),
      tShared('exportColumns.territory'),
      tShared('exportColumns.team'),
    ];
    const rows = salesAgents.map(agent => [
      agent.name,
      agent.email,
      agent.phone,
      agent.role,
      agent.status,
      agent.territory || tShared('notAvailable'),
      agent.teamName || tShared('notAvailable'),
    ]);
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tShared('exportColumns.sheetName'));
    
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
          <p className="text-gray-600">{tTeam('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
        <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{tTeam('title')}</h1>
          <p className="text-sm text-gray-500 mb-4">{tTeam('subtitle')}</p>
        </div>
        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Refresh Button */}
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <RefreshCcw className="w-4 h-4" />
            {tTeam('refresh')}
          </button>

          {/* Export Button */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            {tTeam('exportData')}
          </button>

          {/* Add Agents Button */}
          <button
            onClick={handleCreateAgent}
            className="flex items-center gap-2 px-6 py-2 bg-[#0a61d7] font-semibold text-white rounded-lg hover:bg-[#0851b8] transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {tTeam('addAgent')}
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
              {!loading && (
                <p className="text-xs text-gray-500">
                  {tTeam('agentsLoaded', { count: salesAgents.length })}
                </p>
              )}
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
        onRefresh={fetchData}
      />
    </div>
  );
}
