'use client';

import { SkeletonTeamPage } from '@/components/skeleton/SkeletonTeamPage';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw, Download, Plus, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import TeamList from '@/components/sales/TeamList';
import { SalesAgent, SalesTeam } from '@/components/sales/TeamList';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import type { SalesAgentConnection, SalesTeamConnection } from '@/types/sales';
import { useSalesTranslations } from '@/hooks/useSalesTranslations';

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

export default function SalesTeamPage() {
  const { tTeam, tShared } = useSalesTranslations();
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
    router.push(`/sales/team/details?id=${agent.id}`);
  };

  const handleCreateAgent = () => {
    router.push('/sales/team/create');
  };

  const handleEditAgent = (agent: SalesAgent) => {
    // Navigate to edit agent page
    router.push(`/sales/team/edit?id=${agent.id}`);
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
    return <SkeletonTeamPage />;
  }

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      {/* Page Header */}
      <div className="mb-4 flex min-w-0 flex-col gap-4 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
        <div className="min-w-0">
          <h1 className="mb-2 truncate text-2xl font-bold text-gray-900">{tTeam('title')}</h1>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center @5xl/main:w-auto">
          <button
            onClick={fetchData}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-50 @4xl/main:w-auto"
          >
            <RefreshCcw className="h-4 w-4" />
            {tTeam('refresh')}
          </button>
          <button
            onClick={handleExport}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-50 @4xl/main:w-auto"
          >
            <Download className="h-4 w-4" />
            {tTeam('exportData')}
          </button>
          <button
            onClick={handleCreateAgent}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0851b8] @4xl/main:w-auto"
          >
            <Plus className="h-4 w-4" />
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
