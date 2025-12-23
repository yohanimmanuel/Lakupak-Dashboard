'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  MoreVertical,
  Mail,
  Phone,
  Shield,
  UserPlus,
  Settings,
  Filter,
  ChevronDown,
  CheckCircle,
  Clock,
  X
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';

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
const transformAgentToMember = (agent: AgentData): SalesMember => {
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
  const now = new Date();
  let lastActive = 'Never';
  if (lastActiveDate) {
    const diffMs = now.getTime() - lastActiveDate.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays > 0) {
      lastActive = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      lastActive = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else {
      lastActive = 'Just now';
    }
  }

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
    territory: agent.territory || 'Unassigned',
    status: agent.status as SalesMember['status'],
    avatar: agent.avatar || undefined,
    phone: agent.phone || undefined,
    lastActive,
    salesTarget,
    currentSales,
    conversionRate: Math.round(conversionRate * 10) / 10,
    permissions: getPermissions(agent.role),
  };
};

export default function TeamManagement() {
  const { user } = useUserStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Sales team members state
  const [salesMembers, setSalesMembers] = useState<SalesMember[]>([]);

  // Sales teams state
  const [salesTeams, setSalesTeams] = useState<SalesTeam[]>([]);

  // UI states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('All Roles');
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<SalesMember | null>(null);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  
  // Permissions state
  const [permissions, setPermissions] = useState({
    viewProducts: true,
    manageCustomers: true,
    viewAnalytics: true,
    manageTerritories: true,
    leadAssignment: true,
    setTargets: true,
    createQuotes: true,
    trackPerformance: true,
  });


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
        const transformedMembers: SalesMember[] = agentsData.salesAgents.nodes.map(transformAgentToMember);

        // Transform sales teams to SalesTeam format
        const transformedTeams: SalesTeam[] = teamsData.salesTeams.nodes.map((team) => {
          const members = team.members;
          const manager = members.find((m) => m.role === 'Sales Manager')?.name || members[0]?.name || 'Unassigned';
          
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
        setError(err instanceof Error ? err.message : 'Failed to load team data');
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

  const handleManagePermissions = () => {
    setShowPermissionsModal(true);
  };

  const togglePermission = (permission: keyof typeof permissions) => {
    setPermissions(prev => ({
      ...prev,
      [permission]: !prev[permission]
    }));
  };

  const handleEditMember = (member: SalesMember) => {
    setSelectedMember(member);
    setShowAddMemberModal(true);
  };

  const handleDeleteMember = async (id: string) => {
    if (!user?.id) {
      setError('User not authenticated');
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
      const transformedMembers: SalesMember[] = agentsData.salesAgents.nodes.map(transformAgentToMember);

      setSalesMembers(transformedMembers);
    setSuccess('Sales team member removed successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete team member');
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
    setSuccess('Sales invitation sent successfully');
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
  const roleOptions = ['All Roles', ...Array.from(new Set(salesMembers.map(m => m.role)))];

  const filteredMembers = salesMembers.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.territory.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTeam = selectedTeam === 'All Roles' || member.role === selectedTeam;
    return matchesSearch && matchesTeam;
  });

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
            <p className="text-gray-600">Loading team data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-black mb-2">Team & Sales</h2>
        <p className="text-sm text-gray-600">Manage your sales team, territories, targets, and performance tracking</p>
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
            <h3 className="text-md font-semibold text-black">Sales Performance Overview</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {salesTeams.map((team) => (
              <div key={team.id} className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-sm text-black">{team.name}</h4>
                  <Users className="h-4 w-4 text-gray-400" />
                </div>
                <p className="text-xl font-bold text-black mb-1">{team.memberCount}</p>
                <p className="text-xs text-gray-600">sales reps</p>
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Target: {formatCurrency(team.monthlyTarget)}</span>
                    <span>{getSalesProgress(team.currentSales, team.monthlyTarget).toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-[#0a61d7] h-2 rounded-full" 
                      style={{ width: `${getSalesProgress(team.currentSales, team.monthlyTarget)}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Manager: {team.manager}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sales Team Directory */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-md font-semibold text-black mb-1">Sales Team Directory</h3>
              <p className="text-xs text-gray-600">Search and manage your sales team members and their performance</p>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search sales team members, territories, or roles..."
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
                aria-label="Filter by role"
              >
                <Filter className="w-4 h-4" />
                {selectedTeam}
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
                      {role}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sales Team Members List */}
          <div className="space-y-3">
            {filteredMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                    <span className="text-xs font-medium text-gray-600">
                      {member.name.split(' ').map(n => n[0]).join('')}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-medium text-sm text-black">{member.name}</span>
                      <span className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 ${getStatusColor(member.status)}`}>
                        {getStatusIcon(member.status)}
                        {member.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">{member.role} • {member.territory}</p>
                    <p className="text-xs text-gray-500">{member.email}</p>
                    <div className="flex items-center space-x-4 mt-2">
                      <div className="text-xs">
                        <span className="text-gray-500">Target: </span>
                        <span className="font-medium text-black">{formatCurrency(member.salesTarget)}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-gray-500">Sales: </span>
                        <span className="font-medium text-black">{formatCurrency(member.currentSales)}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-gray-500">Conversion: </span>
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
            ))}
          </div>
        </div>

        {/* Sales Access Control & Territories */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-md font-semibold text-black mb-1">Sales Access Control & Territories</h3>
              <p className="text-xs text-gray-600">Manage sales permissions, territories, and lead assignments</p>
            </div>
            <button 
              onClick={handleManagePermissions}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Shield className="h-4 w-4" />
              Manage Permissions
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <h4 className="font-medium text-black mb-2">Sales Role Permissions</h4>
               <div className="space-y-2">
                 <div className="flex items-center justify-between">
                   <span className="text-xs text-gray-600">View Products & Orders</span>
                   <span className={`text-xs px-2 py-1 rounded ${permissions.viewProducts ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                     {permissions.viewProducts ? 'All Access' : 'Manager Only'}
                   </span>
                 </div>
                 <div className="flex items-center justify-between">
                   <span className="text-xs text-gray-600">Manage Customers</span>
                   <span className={`text-xs px-2 py-1 rounded ${permissions.manageCustomers ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                     {permissions.manageCustomers ? 'All Access' : 'Manager Only'}
                   </span>
                 </div>
                 <div className="flex items-center justify-between">
                   <span className="text-xs text-gray-600">View Sales Analytics</span>
                   <span className={`text-xs px-2 py-1 rounded ${permissions.viewAnalytics ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                     {permissions.viewAnalytics ? 'All Access' : 'Manager Only'}
                   </span>
                 </div>
                 <div className="flex items-center justify-between">
                   <span className="text-xs text-gray-600">Manage Territories</span>
                   <span className={`text-xs px-2 py-1 rounded ${permissions.manageTerritories ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                     {permissions.manageTerritories ? 'All Access' : 'Manager Only'}
                   </span>
                 </div>
                 <div className="flex items-center justify-between">
                   <span className="text-xs text-gray-600">Lead Assignment</span>
                   <span className={`text-xs px-2 py-1 rounded ${permissions.leadAssignment ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                     {permissions.leadAssignment ? 'All Access' : 'Manager Only'}
                   </span>
                 </div>
                 <div className="flex items-center justify-between">
                   <span className="text-xs text-gray-600">Set Sales Targets</span>
                   <span className={`text-xs px-2 py-1 rounded ${permissions.setTargets ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                     {permissions.setTargets ? 'All Access' : 'Manager Only'}
                   </span>
                 </div>
                 <div className="flex items-center justify-between">
                   <span className="text-xs text-gray-600">Create Quotes & Invoices</span>
                   <span className={`text-xs px-2 py-1 rounded ${permissions.createQuotes ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                     {permissions.createQuotes ? 'All Access' : 'Manager Only'}
                   </span>
                 </div>
                 <div className="flex items-center justify-between">
                   <span className="text-xs text-gray-600">Track Sales Performance</span>
                   <span className={`text-xs px-2 py-1 rounded ${permissions.trackPerformance ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                     {permissions.trackPerformance ? 'All Access' : 'Manager Only'}
                   </span>
                 </div>
               </div>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <h4 className="font-medium text-sm text-black mb-2">Territory Management</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Jakarta & West Java</span>
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">Sarah Johnson</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Surabaya & East Java</span>
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">Michael Chen</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Bali & Nusa Tenggara</span>
                  <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">Lisa Rodriguez</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Medan & North Sumatra</span>
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">David Kim</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Makassar & Sulawesi</span>
                  <span className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded">Unassigned</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Pontianak & Kalimantan</span>
                  <span className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded">Unassigned</span>
                </div>
              </div>
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
                {selectedMember ? 'Edit Sales Team Member' : 'Add Sales Team Member'}
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
              <div className="text-gray-500 mb-2">Sales team member form will be implemented</div>
              <div className="text-sm text-gray-400">This is a design preview</div>
            </div>
          </div>
        </div>
      )}

      {/* Manage Permissions Modal */}
      {showPermissionsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto hide-scrollbar">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-black">Manage Sales Permissions</h3>
              <button
                onClick={() => setShowPermissionsModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Sales Team Permissions */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-black">Sales Team Permissions</h4>
                  <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">Centralized Access</span>
                </div>
                <p className="text-xs text-gray-600 mb-4">All sales team members have equal access to these features</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center space-x-2 cursor-pointer" onClick={() => togglePermission('viewProducts')}>
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        checked={permissions.viewProducts}
                        onChange={() => togglePermission('viewProducts')}
                        className="sr-only" 
                      />
                      <div className={`w-4 h-4 border-2 rounded flex items-center justify-center transition-all duration-200 transition-all duration-200 ${permissions.viewProducts ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300 hover:border-green-400 hover:border-green-400'}`}>
                        {permissions.viewProducts && (
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-600">View Products & Orders</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer" onClick={() => togglePermission('manageCustomers')}>
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        checked={permissions.manageCustomers}
                        onChange={() => togglePermission('manageCustomers')}
                        className="sr-only" 
                      />
                      <div className={`w-4 h-4 border-2 rounded flex items-center justify-center transition-all duration-200 transition-all duration-200 ${permissions.manageCustomers ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300 hover:border-green-400 hover:border-green-400'}`}>
                        {permissions.manageCustomers && (
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-600">Manage Customers</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer" onClick={() => togglePermission('viewAnalytics')}>
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        checked={permissions.viewAnalytics}
                        onChange={() => togglePermission('viewAnalytics')}
                        className="sr-only" 
                      />
                      <div className={`w-4 h-4 border-2 rounded flex items-center justify-center transition-all duration-200 transition-all duration-200 ${permissions.viewAnalytics ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300 hover:border-green-400 hover:border-green-400'}`}>
                        {permissions.viewAnalytics && (
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-600">View Sales Analytics</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer" onClick={() => togglePermission('manageTerritories')}>
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        checked={permissions.manageTerritories}
                        onChange={() => togglePermission('manageTerritories')}
                        className="sr-only" 
                      />
                      <div className={`w-4 h-4 border-2 rounded flex items-center justify-center transition-all duration-200 ${permissions.manageTerritories ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300 hover:border-green-400'}`}>
                        {permissions.manageTerritories && (
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-600">Manage Territories</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer" onClick={() => togglePermission('leadAssignment')}>
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        checked={permissions.leadAssignment}
                        onChange={() => togglePermission('leadAssignment')}
                        className="sr-only" 
                      />
                      <div className={`w-4 h-4 border-2 rounded flex items-center justify-center transition-all duration-200 ${permissions.leadAssignment ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300 hover:border-green-400'}`}>
                        {permissions.leadAssignment && (
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-600">Lead Assignment</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer" onClick={() => togglePermission('setTargets')}>
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        checked={permissions.setTargets}
                        onChange={() => togglePermission('setTargets')}
                        className="sr-only" 
                      />
                      <div className={`w-4 h-4 border-2 rounded flex items-center justify-center transition-all duration-200 ${permissions.setTargets ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300 hover:border-green-400'}`}>
                        {permissions.setTargets && (
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-600">Set Sales Targets</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer" onClick={() => togglePermission('createQuotes')}>
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        checked={permissions.createQuotes}
                        onChange={() => togglePermission('createQuotes')}
                        className="sr-only" 
                      />
                      <div className={`w-4 h-4 border-2 rounded flex items-center justify-center transition-all duration-200 ${permissions.createQuotes ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300 hover:border-green-400'}`}>
                        {permissions.createQuotes && (
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-600">Create Quotes & Invoices</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer" onClick={() => togglePermission('trackPerformance')}>
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        checked={permissions.trackPerformance}
                        onChange={() => togglePermission('trackPerformance')}
                        className="sr-only" 
                      />
                      <div className={`w-4 h-4 border-2 rounded flex items-center justify-center transition-all duration-200 ${permissions.trackPerformance ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300 hover:border-green-400'}`}>
                        {permissions.trackPerformance && (
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-600">Track Sales Performance</span>
                  </label>
                </div>
              </div>

              {/* Territory Management */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h4 className="font-semibold text-black">Territory Assignments</h4>
                    <p className="text-xs text-gray-500 italic">*Territories mentioned are based on your input in the sales regions</p>
                  </div>
                </div>
                 <div className="space-y-3">
                   {salesMembers.map((member) => (
                     <div key={member.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                       <div>
                         <span className="font-medium text-xs text-black">{member.territory}</span>
                         <span className="text-xs text-gray-500 ml-2">({member.role})</span>
                       </div>
                       <div className="relative">
                         <select 
                           className="appearance-none bg-white border border-gray-300 rounded-lg px-3 py-1.5 pr-8 text-xs text-black focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
                           defaultValue={member.name}
                         >
                           <option value="Sarah Johnson">Sarah Johnson</option>
                           <option value="Michael Chen">Michael Chen</option>
                           <option value="Lisa Rodriguez">Lisa Rodriguez</option>
                           <option value="David Kim">David Kim</option>
                         </select>
                         <ChevronDown className="h-3 w-3 absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                       </div>
                     </div>
                   ))}
                 </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowPermissionsModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowPermissionsModal(false);
                    setSuccess('Permissions updated successfully');
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#0a61d7] rounded-lg hover:bg-[#0a52c0] transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
