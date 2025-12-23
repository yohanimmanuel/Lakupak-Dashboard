'use client';

import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Eye, Plus, ChevronDown, ChevronRight, Users, User, Edit, Trash2, Mail, Phone, ChevronLeft, Filter, X, MapPin } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { fetchGraphQL } from '@/lib/graphqlClient';

export interface FavoriteProduct {
  productId: string;
  productDbId?: number; // Database ID for GraphQL mutations
  name: string;
  productType: string;
  brand?: string;
  images?: string[];
  sellingPrice?: string;
}

export interface FieldReport {
  id: string;
  date: string;
  location?: string;
  startTime?: string;
  endTime?: string;
  activities?: {
    visits: number;
    customersMet: number;
    productsDemonstrated: number;
    salesMade: number;
  };
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SalesTarget {
  id?: string;
  period: string;
  goal: number;
  achieved: number;
  unitsSold: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SalesAgent {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'Sales Manager' | 'Sales Rep' | 'Sales Support' | 'Lead Gen' | 'Account Manager';
  status: 'active' | 'inactive';
  avatar?: string;
  territory?: string;
  bio?: string;
  sex?: string;
  salesTarget?: number;
  currentSales?: number;
  teamId?: string;
  teamName?: string;
  favoriteProducts?: FavoriteProduct[];
  fieldReports?: FieldReport[];
  salesTargets?: SalesTarget[];
  userId?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SalesTeam {
  id: string;
  name: string; // Region name (e.g., "Jakarta Team", "Regional Team")
  memberIds: string[]; // IDs of agents in this region
  members: SalesAgent[]; // Populated members for display
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
  const [selectedTab, setSelectedTab] = useState('individuals');
  const [search, setSearch] = useState('');
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const agentsPerPage = 8;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const [selectedRole, setSelectedRole] = useState<string>('All Roles');
  const [selectedStatus, setSelectedStatus] = useState<string>('All Status');
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  
  // Team modal state
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<SalesTeam | null>(null);
  const [teamName, setTeamName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());

  // Reset pagination when search, tab, or filters change
  useEffect(() => {
    setPage(1);
  }, [search, selectedTab, selectedRole, selectedStatus]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target as Node)) {
        setShowRoleDropdown(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setShowStatusDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Get user currency for display - safe to use on both server and client
  const userCurrency = user?.currency || getDefaultCurrency();

  // Helper to get teams with populated members
  const getTeamsWithMembers = (teams: SalesTeam[]): SalesTeam[] => {
    return teams.map(team => ({
      ...team,
      members: salesAgents.filter(agent => team.memberIds.includes(agent.id))
    }));
  };

  const agents = salesAgents;
  const teams = getTeamsWithMembers(salesTeams);

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

  // Team modal handlers
  const handleOpenCreateTeam = () => {
    setEditingTeam(null);
    setTeamName('');
    setSelectedMemberIds(new Set());
    setShowTeamModal(true);
  };

  const handleOpenEditTeam = (team: SalesTeam) => {
    setEditingTeam(team);
    setTeamName(team.name);
    setSelectedMemberIds(new Set(team.memberIds));
    setShowTeamModal(true);
  };

  const handleCloseTeamModal = () => {
    setShowTeamModal(false);
    setEditingTeam(null);
    setTeamName('');
    setSelectedMemberIds(new Set());
  };

  const handleToggleMember = (agentId: string) => {
    setSelectedMemberIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(agentId)) {
        newSet.delete(agentId);
      } else {
        newSet.add(agentId);
      }
      return newSet;
    });
  };

  const handleSelectAllMembers = () => {
    if (selectedMemberIds.size === agents.length && agents.length > 0) {
      setSelectedMemberIds(new Set());
    } else {
      setSelectedMemberIds(new Set(agents.map(agent => agent.id)));
    }
  };

  const handleSaveTeam = async () => {
    if (!teamName.trim()) {
      alert('Please enter a team/region name');
      return;
    }

    if (selectedMemberIds.size === 0) {
      alert('Please select at least one sales agent');
      return;
    }

    try {
      const user = useUserStore.getState().user;
      if (!user?.id) {
        alert('User not authenticated');
        return;
      }

      if (editingTeam) {
        // Update team
        const UPDATE_TEAM_MUTATION = `
          mutation UpdateSalesTeam($userId: Int!, $input: UpdateSalesTeamInput!) {
            updateSalesTeam(userId: $userId, input: $input) {
              id
              name
              memberIds
            }
          }
        `;

        await fetchGraphQL(UPDATE_TEAM_MUTATION, {
          userId: user.id,
          input: {
            id: editingTeam.id,
            name: teamName.trim(),
            memberIds: Array.from(selectedMemberIds),
          },
        });

        if (onEditTeam) {
          onEditTeam({
            id: editingTeam.id,
            name: teamName.trim(),
            memberIds: Array.from(selectedMemberIds),
            members: agents.filter(agent => selectedMemberIds.has(agent.id)),
          });
        }
      } else {
        // Create team
        const CREATE_TEAM_MUTATION = `
          mutation CreateSalesTeam($userId: Int!, $input: CreateSalesTeamInput!) {
            createSalesTeam(userId: $userId, input: $input) {
              id
              name
              memberIds
            }
          }
        `;

        await fetchGraphQL(CREATE_TEAM_MUTATION, {
          userId: user.id,
          input: {
            name: teamName.trim(),
            memberIds: Array.from(selectedMemberIds),
          },
        });

        if (onCreateTeam) {
          onCreateTeam();
        }
      }

      handleCloseTeamModal();
    } catch (error) {
      console.error('Error saving team:', error);
      alert(error instanceof Error ? error.message : 'Failed to save team. Please try again.');
    }
  };


  // Get unique roles and statuses from agents
  const uniqueRoles = Array.from(new Set(agents.map(agent => agent.role))).sort();
  const roleOptions = ['All Roles', ...uniqueRoles];
  const statusOptions = ['All Status', 'Active', 'Inactive'];

  const filteredAgents = agents.filter(agent => {
    const searchLower = search.toLowerCase();
    const matchesSearch = (
      agent.name.toLowerCase().includes(searchLower) ||
      agent.email.toLowerCase().includes(searchLower) ||
      agent.phone.toLowerCase().includes(searchLower) ||
      agent.role.toLowerCase().includes(searchLower) ||
      (agent.territory && agent.territory.toLowerCase().includes(searchLower))
    );
    
    const matchesRole = selectedRole === 'All Roles' || agent.role === selectedRole;
    const matchesStatus = selectedStatus === 'All Status' || 
      (selectedStatus === 'Active' && agent.status === 'active') ||
      (selectedStatus === 'Inactive' && agent.status === 'inactive');
    
    return matchesSearch && matchesRole && matchesStatus;
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

      {/* Search and Filters - Below Tabs */}
      {selectedTab === 'individuals' && (
        <div className="flex flex-col md:flex-row gap-2 mb-4 items-start md:items-center">
          {/* Search Bar */}
          <div className="relative w-full md:w-150">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search agents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#e6e6e6] text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7] bg-white"
            />
          </div>

          {/* Role Filter Dropdown */}
          <div className="relative" ref={roleDropdownRef}>
            <button
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
              onClick={() => {
                setShowRoleDropdown(v => !v);
                setShowStatusDropdown(false);
              }}
            >
              <Filter className="w-4 h-4" />
              {selectedRole}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showRoleDropdown && (
              <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow z-20">
                {roleOptions.map((role) => (
                  <button
                    key={role}
                    onClick={() => {
                      setSelectedRole(role);
                      setShowRoleDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                      selectedRole === role
                        ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status Filter Dropdown */}
          <div className="relative" ref={statusDropdownRef}>
            <button
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm"
              onClick={() => {
                setShowStatusDropdown(v => !v);
                setShowRoleDropdown(false);
              }}
            >
              <Filter className="w-4 h-4" />
              {selectedStatus}
              <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
            </button>
            {showStatusDropdown && (
              <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow z-20">
                {statusOptions.map((status) => (
                  <button
                    key={status}
                    onClick={() => {
                      setSelectedStatus(status);
                      setShowStatusDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                      selectedStatus === status
                        ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
                          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
                            {agent.avatar ? (
                              <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-medium text-black">
                                {agent.name.split(' ').map(n => n[0]).join('')}
                              </span>
                            )}
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
              <p className="text-sm mb-4">No teams found</p>
              <button
                onClick={handleOpenCreateTeam}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors font-medium text-sm"
              >
                <Plus className="w-4 h-4" />
                Create New Team
              </button>
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
                                className="w-8 h-8 bg-gray-200 rounded-full border-2 border-white flex items-center justify-center overflow-hidden"
                                style={{ zIndex: team.members.length - idx }}
                              >
                                {member.avatar ? (
                                  <img src={member.avatar} alt={member.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-xs font-medium text-gray-600">
                                    {member.name.split(' ').map(n => n[0]).join('')}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{team.name}</div>
                            <div className="text-xs text-gray-500">{team.members.length} members</div>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleOpenEditTeam(team)}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
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
                                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
                                        {member.avatar ? (
                                          <img src={member.avatar} alt={member.name} className="w-full h-full object-cover" />
                                        ) : (
                                          <span className="text-xs font-medium text-gray-600">
                                            {member.name.split(' ').map(n => n[0]).join('')}
                                          </span>
                                        )}
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
              <div className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <button
                  onClick={handleOpenCreateTeam}
                  className="flex items-center gap-2 text-sm text-[#0a61d7] hover:text-[#0851b8] font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Create New Team
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Team Modal */}
      {showTeamModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseTeamModal();
            }
          }}
          role="dialog"
          aria-modal="true"
        >
          <div 
            className="bg-white rounded-lg shadow-xl p-4 w-full max-w-5xl relative max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={handleCloseTeamModal}
              className="absolute top-5 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[#0a61d7] rounded-lg flex items-center justify-center">
                <MapPin className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-black">
                  {editingTeam ? 'Edit Team' : 'Create New Team'}
                </h2>
                <p className="text-gray-500 text-sm">
                  {editingTeam ? 'Update team/region information' : 'Assign sales agents to a region'}
                </p>
              </div>
            </div>
            <div className="border-b border-gray-200 -mx-6 mb-4"></div>

            {/* Form */}
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[60vh] hide-scrollbar">
              {/* Team/Region Name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Team/Region Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g., Jakarta Team, Regional Team"
                  className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2"
                />
              </div>

              {/* Select Agents */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-gray-700">
                    Sales Agents <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleSelectAllMembers}
                    className="text-xs text-[#0a61d7] hover:text-[#0851b8] font-medium"
                  >
                    {selectedMemberIds.size === agents.length && agents.length > 0 ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                
                <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                  {agents.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-xs">
                      No sales agents available
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {agents.map((agent) => (
                        <label
                          key={agent.id}
                          className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleMember(agent.id)}
                            className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              selectedMemberIds.has(agent.id)
                                ? 'bg-green-500 border-green-500'
                                : 'bg-white border-gray-300 hover:border-green-400'
                            }`}
                            aria-label={selectedMemberIds.has(agent.id) ? `Deselect ${agent.name}` : `Select ${agent.name}`}
                          >
                            {selectedMemberIds.has(agent.id) && (
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </button>
                          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {agent.avatar ? (
                              <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-medium text-gray-600">
                                {agent.name.split(' ').map(n => n[0]).join('')}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-900">{agent.name}</div>
                            <div className="text-xs text-gray-500">{agent.email}</div>
                          </div>
                          <div className="text-xs text-gray-500">{agent.role}</div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {selectedMemberIds.size > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    {selectedMemberIds.size} agent{selectedMemberIds.size !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-gray-200 -mx-4 px-4">
              <button
                type="button"
                onClick={handleCloseTeamModal}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTeam}
                className="px-4 py-2 text-xs font-medium text-white bg-[#0a61d7] rounded-lg hover:bg-[#0851b8] transition-colors"
              >
                {editingTeam ? 'Update Team' : 'Create Team'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
