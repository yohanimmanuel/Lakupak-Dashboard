'use client';

import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Eye, Plus, ChevronDown, ChevronRight, Users, User, Edit, Trash2, Mail, Phone, ChevronLeft } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';

export interface SalesAgent {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'Sales Manager' | 'Sales Rep' | 'Sales Support' | 'Lead Gen' | 'Account Manager';
  status: 'active' | 'inactive';
  avatar?: string;
  territory?: string;
  salesTarget?: number;
  currentSales?: number;
  teamId?: string;
  teamName?: string;
}

export interface SalesTeam {
  id: string;
  name: string;
  manager: string;
  managerId: string;
  members: SalesAgent[];
  monthlyTarget?: number;
  currentSales?: number;
}

interface TeamListProps {
  salesAgents?: SalesAgent[];
  salesTeams?: SalesTeam[];
  onCreateAgent?: () => void;
  onViewAgent?: (agent: SalesAgent) => void;
  onEditAgent?: (agent: SalesAgent) => void;
  onDeleteAgent?: (agentId: string) => void;
  onEditTeam?: (team: SalesTeam) => void;
  onCreateTeam?: () => void;
}

const tabs = [
  { label: 'Individuals', value: 'individuals' },
  { label: 'Teams', value: 'teams' },
];

export default function TeamList({
  salesAgents = [],
  salesTeams = [],
  onCreateAgent,
  onViewAgent,
  onEditAgent,
  onDeleteAgent,
  onEditTeam,
  onCreateTeam,
}: TeamListProps) {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const [isClient, setIsClient] = useState(false);
  const [selectedTab, setSelectedTab] = useState('individuals');
  const [search, setSearch] = useState('');
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const agentsPerPage = 8;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  // Prevent hydration mismatch by only using user currency on client
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Reset pagination when search or tab changes
  useEffect(() => {
    setPage(1);
  }, [search, selectedTab]);

  // Get user currency for display (only on client)
  const userCurrency = isClient ? (user?.currency || getDefaultCurrency()) : getDefaultCurrency();

  // Sample data if not provided
  const defaultAgents: SalesAgent[] = salesAgents.length > 0 ? salesAgents : [
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

  const defaultTeams: SalesTeam[] = salesTeams.length > 0 ? salesTeams : [
    {
      id: '1',
      name: 'Jakarta Team',
      manager: 'Sarah Johnson',
      managerId: '1',
      members: [defaultAgents[0], defaultAgents[1]],
      monthlyTarget: 150000000,
      currentSales: 120000000,
    },
    {
      id: '2',
      name: 'Regional Team',
      manager: 'Michael Chen',
      managerId: '2',
      members: [defaultAgents[1], defaultAgents[3]],
      monthlyTarget: 200000000,
      currentSales: 180000000,
    },
  ];

  const agents = salesAgents.length > 0 ? salesAgents : defaultAgents;
  const teams = salesTeams.length > 0 ? salesTeams : defaultTeams;

  // Update indicator position when tab changes
  useLayoutEffect(() => {
    const activeTabIndex = tabs.findIndex(tab => tab.value === selectedTab);
    const activeTab = tabRefs.current[activeTabIndex];
    
    if (activeTab) {
      const left = activeTab.offsetLeft;
      const width = activeTab.offsetWidth;
      setIndicatorStyle({ left, width });
    }
  }, [selectedTab]);

  const toggleTeam = (teamId: string) => {
    setExpandedTeams(prev => {
      const newSet = new Set(prev);
      if (newSet.has(teamId)) {
        newSet.delete(teamId);
      } else {
        newSet.add(teamId);
      }
      return newSet;
    });
  };

  const handleViewAgent = (agent: SalesAgent) => {
    if (onViewAgent) {
      onViewAgent(agent);
    } else {
      router.push(`/marketing/team/details?id=${agent.id}`);
    }
  };

  const handleAgentSelect = (agentId: string) => {
    setSelectedAgents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(agentId)) {
        newSet.delete(agentId);
      } else {
        newSet.add(agentId);
      }
      return newSet;
    });
  };

  const handleRowClick = (agent: SalesAgent, event: React.MouseEvent) => {
    // Don't trigger row click if clicking on checkbox or button
    if ((event.target as HTMLElement).closest('button') || (event.target as HTMLElement).closest('th')) {
      return;
    }
    // Toggle selection when clicking the row
    handleAgentSelect(agent.id);
  };


  const handleSelectAll = () => {
    if (selectedAgents.size === filteredAgents.length && filteredAgents.length > 0) {
      setSelectedAgents(new Set());
    } else {
      setSelectedAgents(new Set(filteredAgents.map(agent => agent.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedAgents.size === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedAgents.size} agent${selectedAgents.size > 1 ? 's' : ''}?`)) {
      selectedAgents.forEach(agentId => {
        if (onDeleteAgent) {
          onDeleteAgent(agentId);
        }
      });
      setSelectedAgents(new Set());
    }
  };


  const filteredAgents = agents.filter(agent => {
    const searchLower = search.toLowerCase();
    return (
      agent.name.toLowerCase().includes(searchLower) ||
      agent.email.toLowerCase().includes(searchLower) ||
      agent.phone.toLowerCase().includes(searchLower) ||
      agent.role.toLowerCase().includes(searchLower) ||
      (agent.territory && agent.territory.toLowerCase().includes(searchLower))
    );
  });

  // Pagination for individuals table
  const totalPages = Math.ceil(filteredAgents.length / agentsPerPage);
  const fromRow = (page - 1) * agentsPerPage + 1;
  const toRow = Math.min(page * agentsPerPage, filteredAgents.length);
  const paginatedAgents = filteredAgents.slice((page - 1) * agentsPerPage, page * agentsPerPage);

  const filteredTeams = teams.filter(team => {
    const searchLower = search.toLowerCase();
    return (
      team.name.toLowerCase().includes(searchLower) ||
      team.manager.toLowerCase().includes(searchLower) ||
      team.members.some(member => 
        member.name.toLowerCase().includes(searchLower) ||
        member.email.toLowerCase().includes(searchLower)
      )
    );
  });

  const formatCurrencyAmount = (amount: number) => {
    return formatCurrency(amount, userCurrency);
  };

  const statusBadge = (status: string) => {
    if (status === "active" || status === "Active") return "bg-green-100 text-green-500";
    if (status === "inactive" || status === "Inactive") return "bg-gray-100 text-gray-500";
    return "bg-gray-100 text-gray-500";
  };

  return (
    <div className="w-full mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        {/* Title and Count */}
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Agents <span className="font-medium text-gray-400">{agents.length}</span>
          </h2>
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Start typing agent's name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#e6e6e6] text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7] bg-white"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4">
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
            {tabs.map((tab, idx) => (
              <button
                key={tab.value}
                ref={el => { tabRefs.current[idx] = el; }}
                onClick={() => setSelectedTab(tab.value)}
                className={`relative z-10 flex-1 px-6 py-2 font-medium text-[14px] transition-colors duration-200 focus:outline-none ${
                  selectedTab === tab.value
                    ? 'text-white'
                    : 'text-gray-700 hover:text-[#0a61d7]'
                } ${
                  idx === 0 ? 'rounded-l-lg' : idx === tabs.length - 1 ? 'rounded-r-lg' : ''
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
      </div>

      {/* Bulk Action Bar */}
      {selectedTab === 'individuals' && selectedAgents.size > 0 && (
        <div className="bg-gradient-to-r from-green-500 to-green-400 rounded-lg p-3 md:p-4 mb-2">
          {/* Mobile Layout */}
          <div className="md:hidden space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <div className="flex items-center justify-center text-sm font-semibold text-white">
                  {selectedAgents.size}
                </div>
                <span className="text-sm font-semibold text-white">
                  {selectedAgents.size === 1 ? 'agent' : 'agents'} selected
                </span>
              </div>
            </div>
            <div className="text-white text-xs font-semibold leading-relaxed">
              {selectedAgents.size === 1 
                ? 'Select agent to be removed.'
                : 'Select agents to be removed.'
              }
            </div>
            <button
              onClick={handleBulkDelete}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
              aria-label={`Remove ${selectedAgents.size} selected agent${selectedAgents.size === 1 ? '' : 's'}`}
            >
              <Trash2 className="w-4 h-4" />
              {selectedAgents.size === 1 ? 'Remove Agent' : 'Remove Selected'}
            </button>
          </div>
          
          {/* Desktop Layout */}
          <div className="hidden md:flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="text-white flex items-center justify-center text-sm font-semibold">
                  {selectedAgents.size}
                </div>
                <span className="text-sm font-semibold text-white">
                  {selectedAgents.size === 1 ? 'agent' : 'agents'} selected
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-white text-xs md:text-sm font-semibold">
                {selectedAgents.size === 1 
                  ? 'Select agent to be removed. '
                  : 'Select agents to be removed. '
                }
              </span>
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold text-sm rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                aria-label={`Remove ${selectedAgents.size} selected agent${selectedAgents.size === 1 ? '' : 's'}`}
              >
                <Trash2 className="w-4 h-4" />
                {selectedAgents.size === 1 ? 'Remove Agent' : 'Remove Selected'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {selectedTab === 'individuals' && (
        <div className="space-y-3">
          {filteredAgents.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <User className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-sm">No agents found</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg">
              <table className="min-w-full text-sm text-left whitespace-nowrap text-xs">
                <thead className="bg-gray-100 text-gray-500 whitespace-nowrap">
                  <tr>
                    <th className="py-3 px-4 font-medium uppercase">
                      <button
                        onClick={handleSelectAll}
                        className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          selectedAgents.size === filteredAgents.length && filteredAgents.length > 0
                            ? 'bg-green-500 border-green-500'
                            : 'bg-white border-gray-300 hover:border-green-400'
                        }`}
                        aria-label={selectedAgents.size === filteredAgents.length ? 'Deselect all agents' : 'Select all agents'}
                      >
                        {selectedAgents.size === filteredAgents.length && filteredAgents.length > 0 && (
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    </th>
                    <th className="py-3 px-4 font-medium uppercase">NAME</th>
                    <th className="py-3 px-4 font-medium uppercase">PHONE</th>
                    <th className="py-3 px-4 font-medium uppercase">EMAIL</th>
                    <th className="py-3 px-4 font-medium uppercase">ROLE</th>
                    <th className="py-3 px-4 font-medium uppercase">STATUS</th>
                    <th className="py-3 px-4 font-medium uppercase text-center">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {paginatedAgents.map((agent) => (
                    <tr 
                      key={agent.id} 
                      className={`border-b transition cursor-pointer ${
                        selectedAgents.has(agent.id) 
                          ? 'bg-blue-50' 
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={(e) => handleRowClick(agent, e)}
                    >
                      <td className="py-3 px-4 text-xs">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAgentSelect(agent.id);
                          }}
                          className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            selectedAgents.has(agent.id)
                              ? 'bg-green-500 border-green-500'
                              : 'bg-white border-gray-300 hover:border-green-400'
                          }`}
                          aria-label={selectedAgents.has(agent.id) ? `Deselect ${agent.name}` : `Select ${agent.name}`}
                        >
                          {selectedAgents.has(agent.id) && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                            <span className="text-xs font-medium text-black">
                              {agent.name.split(' ').map(n => n[0]).join('')}
                            </span>
                          </div>
                          <span className="text-xs font-medium text-black">{agent.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-black">{agent.phone}</td>
                      <td className="py-3 px-4 text-xs text-black">{agent.email}</td>
                      <td className="py-3 px-4 text-xs text-black">{agent.role}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${statusBadge(agent.status)}`}>
                          {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleViewAgent(agent)}
                          className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-blue-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                          aria-label={`View ${agent.name}`}
                        >
                          <Eye className="w-4 h-4 text-[#0a61d7]" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination for Individuals Table */}
          {filteredAgents.length > 0 && (
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-2">
              {/* Left: Showing X to Y of Z */}
              <div className="text-sm text-gray-500">
                Showing {fromRow} to {toRow} of {filteredAgents.length}
              </div>
              {/* Right: Pagination Controls */}
              <div className="flex items-center gap-3">
                <button
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || totalPages === 0}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-500" />
                </button>
                {totalPages > 0 && Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 7) {
                    pageNum = i + 1;
                  } else if (page <= 4) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 3) {
                    pageNum = totalPages - 6 + i;
                  } else {
                    pageNum = page - 3 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      className={`px-3 py-2 rounded-lg font-semibold text-sm transition ${
                        pageNum === page 
                          ? 'bg-[#0a61d7] text-white' 
                          : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
                      }`}
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                {totalPages > 7 && page < totalPages - 3 && (
                  <span className="px-2 text-gray-500">...</span>
                )}
                {totalPages > 7 && page < totalPages - 3 && (
                  <button
                    className={`px-3 py-2 rounded-lg font-semibold text-sm transition ${
                      page === totalPages
                        ? 'bg-[#0a61d7] text-white'
                        : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
                    }`}
                    onClick={() => setPage(totalPages)}
                  >
                    {totalPages}
                  </button>
                )}
                <button
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || totalPages === 0}
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'teams' && (
        <div className="space-y-3">
          {filteredTeams.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-sm">No teams found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTeams.map((team) => {
                const isExpanded = expandedTeams.has(team.id);
                return (
                  <div key={team.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Team Header */}
                    <div className="flex items-center justify-between p-4 transition-colors">
                      <div className="flex items-center gap-4 flex-1">
                        <button
                          onClick={() => toggleTeam(team.id)}
                          className="p-1 rounded transition-colors hover:bg-gray-50"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-gray-600" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-600" />
                          )}
                        </button>
                        <div className="flex items-center gap-3">
                          <div className="flex -space-x-2">
                            {team.members.slice(0, 5).map((member, idx) => (
                              <div
                                key={member.id}
                                className="w-8 h-8 bg-gray-200 rounded-full border-2 border-white flex items-center justify-center"
                                style={{ zIndex: team.members.length - idx }}
                              >
                                <span className="text-xs font-medium text-gray-600">
                                  {member.name.split(' ').map(n => n[0]).join('')}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{team.name}</div>
                            <div className="text-xs text-gray-500">{team.members.length} members</div>
                          </div>
                        </div>
                      </div>
                      {onEditTeam && (
                        <button
                          onClick={() => onEditTeam(team)}
                          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Team Members */}
                    {isExpanded && (
                      <div className="bg-white border-t border-gray-200">
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm text-left whitespace-nowrap text-xs">
                            <thead className="bg-gray-100 text-gray-500 whitespace-nowrap">
                              <tr>
                                <th className="py-3 px-4 font-medium uppercase">NAME</th>
                                <th className="py-3 px-4 font-medium uppercase">PHONE</th>
                                <th className="py-3 px-4 font-medium uppercase">EMAIL</th>
                                <th className="py-3 px-4 font-medium uppercase">ROLE</th>
                                <th className="py-3 px-4 font-medium uppercase text-center">ACTIONS</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white">
                              {team.members.map((member) => (
                                <tr 
                                  key={member.id} 
                                  className="border-b transition hover:bg-gray-50"
                                >
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                                        <span className="text-xs font-medium text-gray-600">
                                          {member.name.split(' ').map(n => n[0]).join('')}
                                        </span>
                                      </div>
                                      <span className="text-xs font-medium text-black">{member.name}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-xs text-black">{member.phone}</td>
                                  <td className="py-3 px-4 text-xs text-black">{member.email}</td>
                                  <td className="py-3 px-4 text-xs text-black">{member.role}</td>
                                  <td className="py-3 px-4 text-center">
                                    <button
                                      onClick={() => handleViewAgent(member)}
                                      className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-blue-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      aria-label={`View ${member.name}`}
                                    >
                                      <Eye className="w-4 h-4 text-[#0a61d7]" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {onCreateAgent && (
                          <div className="p-4 border-t border-gray-200">
                            <button
                              onClick={onCreateAgent}
                              className="flex items-center gap-2 text-sm text-[#0a61d7] hover:text-[#0851b8] font-medium"
                            >
                              <Plus className="w-4 h-4" />
                              Add member(s)
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              
              {/* Create New Team Button */}
              {onCreateTeam && (
                <div className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <button
                    onClick={onCreateTeam}
                    className="flex items-center gap-2 text-sm text-[#0a61d7] hover:text-[#0851b8] font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Create New Team
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
