'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Users, 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  MoreVertical,
  Mail,
  Phone,
  UserPlus,
  Settings,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Clock,
  X
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useSettingsTranslations } from '@/hooks/useSettingsTranslations';
import { TABLE_PAGE_SIZE, getVisiblePageNumbers } from '@/utils/tablePagination';

const ALL_ROLES_FILTER = '__all__';
const UNASSIGNED_TERRITORY = 'Unassigned';

interface SalesMember {
  id: string;
  name: string;
  email: string;
  role: 'Sales Manager' | 'Sales Rep' | 'Sales Support' | 'Lead Gen' | 'Account Manager';
  territory: string;
  status: 'active' | 'inactive' | 'pending';
  avatar?: string;
  phone?: string;
  lastActive: string;
  salesTarget: number;
  currentSales: number;
  conversionRate: number;
  permissions: string[];
}

interface SalesTeam {
  id: string;
  name: string;
  memberCount: number;
  manager: string;
  monthlyTarget: number;
  currentSales: number;
  conversionRate: number;
}

const SALES_AGENTS_QUERY = `
  query GetSalesAgents($userId: Int!, $page: Int, $limit: Int) {
    salesAgents(userId: $userId, page: $page, limit: $limit) {
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
        salesTargets {
          id
          period
          goal
          achieved
          unitsSold
        }
        fieldReports {
          id
          date
          location
        }
      }
      pagination {
        totalCount
      }
    }
  }
`;

const SALES_TEAMS_QUERY = `
  query GetSalesTeams($userId: Int!, $page: Int, $limit: Int) {
    salesTeams(userId: $userId, page: $page, limit: $limit) {
      nodes {
        id
        name
        memberIds
        members {
          id
          name
          role
          status
        }
      }
      pagination {
        totalCount
      }
    }
  }
`;

type AgentData = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  avatar?: string | null;
  territory?: string | null;
  salesTargets: Array<{
    id: string;
    period: string;
    goal: number;
    achieved: number;
    unitsSold: number;
  }>;
  fieldReports: Array<{
    id: string;
    date: string;
    location?: string | null;
  }>;
};

// Helper function to transform agent data to SalesMember
const transformAgentToMember = (
  agent: AgentData,
  formatLastActive: (lastActiveDate: Date | null) => string,
): SalesMember => {
  // Calculate sales metrics from targets
  const latestTarget = agent.salesTargets
    .sort((a, b) => new Date(b.period).getTime() - new Date(a.period).getTime())[0];
  const salesTarget = latestTarget?.goal || 0;
  const currentSales = latestTarget?.achieved || 0;
  const conversionRate = salesTarget > 0 ? (currentSales / salesTarget) * 100 : 0;

  // Get last active from field reports
  const lastReport = agent.fieldReports
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  const lastActiveDate = lastReport ? new Date(lastReport.date) : null;

  // Map role to permissions (simplified - can be enhanced with actual permission system)
  const getPermissions = (role: string): string[] => {
    const basePermissions = ['view_orders'];
    if (role === 'Sales Manager') {
      return [...basePermissions, 'manage_customers', 'view_analytics', 'manage_team'];
    } else if (role === 'Sales Rep' || role === 'Account Manager') {
      return [...basePermissions, 'manage_customers', 'view_analytics'];
    } else if (role === 'Lead Gen') {
      return [...basePermissions, 'manage_leads'];
    }
    return basePermissions;
  };

  return {
    id: agent.id,
    name: agent.name,
    email: agent.email,
    role: agent.role as SalesMember['role'],
    territory: agent.territory || UNASSIGNED_TERRITORY,
    status: agent.status as SalesMember['status'],
    avatar: agent.avatar || undefined,
    phone: agent.phone || undefined,
    lastActive: formatLastActive(lastActiveDate),
    salesTarget,
    currentSales,
    conversionRate: Math.round(conversionRate * 10) / 10,
    permissions: getPermissions(agent.role),
  };
};

export default function TeamManagement() {
  const { user } = useUserStore();
  const { tTeam, translateTeamRole, translateTeamStatus } = useSettingsTranslations();

  const formatLastActive = (lastActiveDate: Date | null): string => {
    if (!lastActiveDate) return tTeam('lastActiveNever');
    const now = new Date();
    const diffMs = now.getTime() - lastActiveDate.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays > 0) {
      return diffDays === 1
        ? tTeam('lastActiveDaysAgo', { count: diffDays })
        : tTeam('lastActiveDaysAgoPlural', { count: diffDays });
    }
    if (diffHours > 0) {
      return diffHours === 1
        ? tTeam('lastActiveHoursAgo', { count: diffHours })
        : tTeam('lastActiveHoursAgoPlural', { count: diffHours });
    }
    return tTeam('lastActiveJustNow');
  };

  const translateTerritory = (territory: string) =>
    territory === UNASSIGNED_TERRITORY ? tTeam('unassigned') : territory;

  const getRoleFilterLabel = (role: string) =>
    role === ALL_ROLES_FILTER ? tTeam('allRoles') : translateTeamRole(role);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Sales team members state
  const [salesMembers, setSalesMembers] = useState<SalesMember[]>([]);

  // Sales teams state
  const [salesTeams, setSalesTeams] = useState<SalesTeam[]>([]);

  // UI states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(ALL_ROLES_FILTER);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<SalesMember | null>(null);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const agentsPerPage = TABLE_PAGE_SIZE;
  const [teamsPage, setTeamsPage] = useState(1);
  const teamsPerPage = TABLE_PAGE_SIZE;

  // Territories derived from sales team members
  const territoryList = useMemo(() => {
    const map = new Map<string, SalesMember[]>();
    for (const member of salesMembers) {
      const t = member.territory || UNASSIGNED_TERRITORY;
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(member);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [salesMembers]);

  // Fetch sales agents and teams from API
  useEffect(() => {
    const fetchData = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Fetch sales agents and teams in parallel
        const [agentsData, teamsData] = await Promise.all([
          fetchGraphQL<{
            salesAgents: {
              nodes: Array<{
                id: string;
                name: string;
                email: string;
                phone: string;
                role: string;
                status: string;
                avatar?: string | null;
                territory?: string | null;
                teamId?: string | null;
                teamName?: string | null;
                salesTargets: Array<{
                  id: string;
                  period: string;
                  goal: number;
                  achieved: number;
                  unitsSold: number;
                }>;
                fieldReports: Array<{
                  id: string;
                  date: string;
                  location?: string | null;
                }>;
              }>;
            };
          }>(SALES_AGENTS_QUERY, {
            userId: user.id,
            page: 1,
            limit: 100,
          }),
          fetchGraphQL<{
            salesTeams: {
              nodes: Array<{
                id: string;
                name: string;
                memberIds: string[];
                members: Array<{
                  id: string;
                  name: string;
                  role: string;
                  status: string;
                }>;
              }>;
            };
          }>(SALES_TEAMS_QUERY, {
            userId: user.id,
            page: 1,
            limit: 100,
          }),
        ]);

        // Transform sales agents to SalesMember format
        const transformedMembers: SalesMember[] = agentsData.salesAgents.nodes.map((agent) =>
          transformAgentToMember(agent, formatLastActive),
        );

        // Transform sales teams to SalesTeam format
        const transformedTeams: SalesTeam[] = teamsData.salesTeams.nodes.map((team) => {
          const members = team.members;
          const manager = members.find((m) => m.role === 'Sales Manager')?.name || members[0]?.name || UNASSIGNED_TERRITORY;
          
          // Calculate team metrics from member targets
          const teamMetrics = members.reduce(
            (acc, member) => {
              const memberData = transformedMembers.find((m) => m.id === member.id);
              if (memberData) {
                acc.monthlyTarget += memberData.salesTarget;
                acc.currentSales += memberData.currentSales;
              }
              return acc;
            },
            { monthlyTarget: 0, currentSales: 0 }
          );

          const conversionRate =
            teamMetrics.monthlyTarget > 0
              ? (teamMetrics.currentSales / teamMetrics.monthlyTarget) * 100
              : 0;

          return {
            id: team.id,
            name: team.name,
            memberCount: members.length,
            manager,
            monthlyTarget: teamMetrics.monthlyTarget,
            currentSales: teamMetrics.currentSales,
            conversionRate: Math.round(conversionRate * 10) / 10,
          };
        });

        setSalesMembers(transformedMembers);
        setSalesTeams(transformedTeams);
      } catch (err) {
        setError(err instanceof Error ? err.message : tTeam('errors.loadTeamDataFailed'));
        // Set empty arrays on error to show empty state
        setSalesMembers([]);
        setSalesTeams([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user?.id]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target as Node)) {
        setShowRoleDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Auto-dismiss success messages
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const handleAddMember = () => {
    setShowAddMemberModal(true);
  };

  const handleEditMember = (member: SalesMember) => {
    setSelectedMember(member);
    setShowAddMemberModal(true);
  };

  const handleDeleteMember = async (id: string) => {
    if (!user?.id) {
      setError(tTeam('errors.userNotAuthenticated'));
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const DELETE_SALES_AGENT_MUTATION = `
        mutation DeleteSalesAgent($userId: Int!, $id: String!) {
          deleteSalesAgent(userId: $userId, id: $id) {
            success
            deleted {
              id
              name
            }
          }
        }
      `;

      await fetchGraphQL(DELETE_SALES_AGENT_MUTATION, {
        userId: user.id,
        id,
      });

      // Refresh data after deletion
      const agentsData = await fetchGraphQL<{
        salesAgents: {
          nodes: Array<{
            id: string;
            name: string;
            email: string;
            phone: string;
            role: string;
            status: string;
            avatar?: string | null;
            territory?: string | null;
            salesTargets: Array<{
              id: string;
              period: string;
              goal: number;
              achieved: number;
              unitsSold: number;
            }>;
            fieldReports: Array<{
              id: string;
              date: string;
              location?: string | null;
            }>;
          }>;
        };
      }>(SALES_AGENTS_QUERY, {
        userId: user.id,
        page: 1,
        limit: 100,
      });

      // Transform and update members (reuse transformation logic)
      const transformedMembers: SalesMember[] = agentsData.salesAgents.nodes.map((agent) =>
        transformAgentToMember(agent, formatLastActive),
      );

      setSalesMembers(transformedMembers);
    setSuccess(tTeam('success.memberRemoved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : tTeam('errors.deleteMemberFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleInviteMember = (id: string) => {
    setSalesMembers(prev => 
      prev.map(member => 
        member.id === id 
          ? { ...member, status: 'pending' as const }
          : member
      )
    );
    setSuccess(tTeam('success.invitationSent'));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-600 bg-green-50';
      case 'inactive':
        return 'text-gray-600 bg-gray-50';
      case 'pending':
        return 'text-yellow-600 bg-yellow-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-3 w-3" />;
      case 'inactive':
        return <X className="h-3 w-3" />;
      case 'pending':
        return <Clock className="h-3 w-3" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  };

  // Get unique roles from members for filter options
  const roleOptions = [ALL_ROLES_FILTER, ...Array.from(new Set(salesMembers.map(m => m.role)))];

  const filteredMembers = salesMembers.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.territory.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTeam = selectedTeam === ALL_ROLES_FILTER || member.role === selectedTeam;
    return matchesSearch && matchesTeam;
  });

  // Reset pagination when search or filter changes
  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedTeam]);

  // Pagination for agents
  const totalPages = Math.ceil(filteredMembers.length / agentsPerPage);
  const fromRow = (page - 1) * agentsPerPage + 1;
  const toRow = Math.min(page * agentsPerPage, filteredMembers.length);
  const paginatedMembers = filteredMembers.slice((page - 1) * agentsPerPage, page * agentsPerPage);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getSalesProgress = (current: number, target: number) => {
    return Math.min((current / target) * 100, 100);
  };

  if (isLoading && salesMembers.length === 0) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">{tTeam('loadingTeamData')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-black mb-2">{tTeam('title')}</h2>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center">
            <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
            <span className="text-sm text-green-800">{success}</span>
          </div>
          <button
            onClick={() => setSuccess(null)}
            className="text-green-600 hover:text-green-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
          <X className="h-4 w-4 text-red-600 mr-2" />
          <span className="text-sm text-red-800">{error}</span>
        </div>
      )}

      <div className="space-y-4">
        {/* Sales Performance Overview */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-md font-semibold text-black">{tTeam('salesTeamOverview')}</h3>
          </div>

          {/* Paginated Teams Grid */}
          {(() => {
            const totalTeamsPages = Math.ceil(salesTeams.length / teamsPerPage);
            const fromTeam = (teamsPage - 1) * teamsPerPage + 1;
            const toTeam = Math.min(teamsPage * teamsPerPage, salesTeams.length);
            const paginatedTeams = salesTeams.slice((teamsPage - 1) * teamsPerPage, teamsPage * teamsPerPage);

            return (
              <>
                <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-2 @5xl/main:grid-cols-4">
                  {paginatedTeams.map((team) => (
                    <div key={team.id} className="p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-sm text-black">{team.name}</h4>
                        <Users className="h-4 w-4 text-gray-400" />
                      </div>
                      <p className="text-xl font-bold text-black mb-1">{team.memberCount}</p>
                      <p className="text-xs text-gray-600">{tTeam('salesReps')}</p>
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>{tTeam('target')} {formatCurrency(team.monthlyTarget)}</span>
                          <span>{getSalesProgress(team.currentSales, team.monthlyTarget).toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-[#0a61d7] h-2 rounded-full" 
                            style={{ width: `${getSalesProgress(team.currentSales, team.monthlyTarget)}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{tTeam('manager')} {team.manager === UNASSIGNED_TERRITORY ? tTeam('unassigned') : team.manager}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination for Teams */}
                {salesTeams.length > 0 && (
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-2">
                    {/* Left: Showing X to Y of Z */}
                    <div className="text-sm text-gray-500">
                      {tTeam('showingRange', { from: fromTeam, to: toTeam, total: salesTeams.length })}
                    </div>
                    {/* Right: Pagination Controls */}
                    <div className="flex items-center gap-3">
                      <button
                        className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => setTeamsPage(p => Math.max(1, p - 1))}
                        disabled={teamsPage === 1 || totalTeamsPages === 0}
                        aria-label={tTeam('previousPageAriaLabel')}
                      >
                        <ChevronLeft className="w-4 h-4 text-gray-500" />
                      </button>
                      {totalTeamsPages > 0 &&
                        getVisiblePageNumbers(teamsPage, totalTeamsPages).map((pageNum) => (
                          <button
                            key={pageNum}
                            className={`px-3 py-2 rounded-lg font-semibold text-sm transition ${
                              pageNum === teamsPage
                                ? 'bg-[#0a61d7] text-white'
                                : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
                            }`}
                            onClick={() => setTeamsPage(pageNum)}
                          >
                            {pageNum}
                          </button>
                        ))}
                      <button
                        className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => setTeamsPage(p => Math.min(totalTeamsPages, p + 1))}
                        disabled={teamsPage === totalTeamsPages || totalTeamsPages === 0}
                        aria-label={tTeam('nextPageAriaLabel')}
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

        {/* Sales Team Directory */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-md font-semibold text-black mb-1">{tTeam('salesTeamDirectory')}</h3>
              <p className="text-xs text-gray-600">{tTeam('salesTeamDirectorySubtitle')}</p>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={tTeam('searchMembersPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border text-sm text-black border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
              />
            </div>
            {/* Role Filter Dropdown */}
            <div className="relative" ref={roleDropdownRef}>
              <button
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                aria-haspopup="true"
                aria-expanded={showRoleDropdown}
                aria-label={tTeam('filterByRoleAriaLabel')}
              >
                <Filter className="w-4 h-4" />
                {getRoleFilterLabel(selectedTeam)}
                <ChevronDown className="w-4 h-4 ml-1 text-gray-500" />
              </button>
              {showRoleDropdown && (
                <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow z-20">
                  {roleOptions.map((role) => (
                    <button
                      key={role}
                      onClick={() => {
                        setSelectedTeam(role);
                        setShowRoleDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm first:rounded-t-lg last:rounded-b-lg ${
                        selectedTeam === role
                          ? 'text-[#0a61d7] font-semibold hover:bg-gray-100'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {getRoleFilterLabel(role)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sales Team Members List */}
          <div className="space-y-3">
            {paginatedMembers.length > 0 ? (
              paginatedMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
                      {member.avatar ? (
                        <img src={member.avatar} alt={member.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-medium text-gray-600">
                          {member.name.split(' ').map(n => n[0]).join('')}
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-medium text-sm text-black">{member.name}</span>
                        <span className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 ${getStatusColor(member.status)}`}>
                          {getStatusIcon(member.status)}
                          {translateTeamStatus(member.status)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">{translateTeamRole(member.role)} • {translateTerritory(member.territory)}</p>
                      <p className="text-xs text-gray-500">{member.email}</p>
                      <div className="flex items-center space-x-4 mt-2">
                        <div className="text-xs">
                          <span className="text-gray-500">{tTeam('target')} </span>
                          <span className="font-medium text-black">{formatCurrency(member.salesTarget)}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-gray-500">{tTeam('sales')} </span>
                          <span className="font-medium text-black">{formatCurrency(member.currentSales)}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-gray-500">{tTeam('conversion')} </span>
                          <span className="font-medium text-black">{member.conversionRate}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                        <div 
                          className="bg-[#0a61d7] h-1.5 rounded-full" 
                          style={{ width: `${getSalesProgress(member.currentSales, member.salesTarget)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-sm">{tTeam('noMembersFound')}</p>
              </div>
            )}
          </div>

          {/* Pagination */}
          {filteredMembers.length > 0 && (
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-2">
              {/* Left: Showing X to Y of Z */}
              <div className="text-sm text-gray-500">
                {tTeam('showingRange', { from: fromRow, to: toRow, total: filteredMembers.length })}
              </div>
              {/* Right: Pagination Controls */}
              <div className="flex items-center gap-3">
                <button
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || totalPages === 0}
                  aria-label={tTeam('previousPageAriaLabel')}
                >
                  <ChevronLeft className="w-4 h-4 text-gray-500" />
                </button>
                {totalPages > 0 &&
                  getVisiblePageNumbers(page, totalPages).map((pageNum) => (
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
                  ))}
                <button
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || totalPages === 0}
                  aria-label={tTeam('nextPageAriaLabel')}
                >
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Territory Management */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="mb-4">
            <h3 className="text-md font-semibold text-black mb-1">{tTeam('territoryManagement')}</h3>
            <p className="text-xs text-gray-600">{tTeam('territoryManagementSubtitle')}</p>
          </div>

          <div className="p-4 border border-gray-200 rounded-lg">
            <div className="space-y-2">
              {territoryList.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">{tTeam('noTerritoriesYet')}</p>
              ) : (
                territoryList.map(([territoryName, members]) => (
                  <div key={territoryName} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                    <span className="text-sm font-medium text-black">{translateTerritory(territoryName)}</span>
                    <span className={`text-xs px-2 py-1 rounded font-medium ${
                      members.length > 0
                        ? 'text-green-600 bg-green-50'
                        : 'text-gray-600 bg-gray-50'
                    }`}>
                      {tTeam('agentCount', { count: members.length })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Member Modal */}
      {showAddMemberModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-black">
                {selectedMember ? tTeam('modal.editMemberTitle') : tTeam('modal.addMemberTitle')}
              </h3>
              <button
                onClick={() => {
                  setShowAddMemberModal(false);
                  setSelectedMember(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="text-center py-4">
              <div className="text-gray-500 mb-2">{tTeam('modal.formNotImplemented')}</div>
              <div className="text-sm text-gray-400">{tTeam('modal.designPreview')}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
