'use client';

import React, { useState, useEffect } from 'react';
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

export default function TeamManagement() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Sales team members state
  const [salesMembers, setSalesMembers] = useState<SalesMember[]>([
    {
      id: '1',
      name: 'Sarah Johnson',
      email: 'sarah.johnson@laku.com',
      role: 'Sales Manager',  
      territory: 'Jakarta & West Java',
      status: 'active',
      phone: '+62 21 1234 5678',
      lastActive: '2 hours ago',
      salesTarget: 50000000,
      currentSales: 42000000,
      conversionRate: 15.2,
      permissions: ['view_orders', 'manage_customers', 'view_analytics', 'manage_team']
    },
    {
      id: '2',
      name: 'Michael Chen',
      email: 'michael.chen@laku.com',
      role: 'Sales Rep',
      territory: 'Surabaya & East Java',
      status: 'active',
      phone: '+62 21 2345 6789',
      lastActive: '1 hour ago',
      salesTarget: 30000000,
      currentSales: 28000000,
      conversionRate: 12.8,
      permissions: ['view_orders', 'manage_customers', 'view_analytics']
    },
    {
      id: '3',
      name: 'Lisa Rodriguez',
      email: 'lisa.rodriguez@laku.com',
      role: 'Lead Gen',
      territory: 'Bali & Nusa Tenggara',
      status: 'pending',
      phone: '+62 21 3456 7890',
      lastActive: 'Never',
      salesTarget: 20000000,
      currentSales: 0,
      conversionRate: 0,
      permissions: ['view_orders', 'manage_leads']
    },
    {
      id: '4',
      name: 'David Kim',
      email: 'david.kim@laku.com',
      role: 'Account Manager',
      territory: 'Medan & North Sumatra',
      status: 'active',
      phone: '+62 21 4567 8901',
      lastActive: '30 minutes ago',
      salesTarget: 40000000,
      currentSales: 35000000,
      conversionRate: 18.5,
      permissions: ['view_orders', 'manage_customers', 'view_analytics']
    }
  ]);

  // Sales teams state
  const [salesTeams, setSalesTeams] = useState<SalesTeam[]>([
    { id: '1', name: 'Jakarta Team', memberCount: 4, manager: 'Sarah Johnson', monthlyTarget: 150000000, currentSales: 120000000, conversionRate: 16.2 },
    { id: '2', name: 'Regional Team', memberCount: 6, manager: 'Michael Chen', monthlyTarget: 200000000, currentSales: 180000000, conversionRate: 14.8 },
    { id: '3', name: 'Enterprise Team', memberCount: 3, manager: 'David Kim', monthlyTarget: 100000000, currentSales: 95000000, conversionRate: 19.1 },
    { id: '4', name: 'Lead Gen Team', memberCount: 2, manager: 'Lisa Rodriguez', monthlyTarget: 50000000, currentSales: 25000000, conversionRate: 8.5 }
  ]);

  // UI states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<SalesMember | null>(null);
  
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

  const handleDeleteMember = (id: string) => {
    setSalesMembers(prev => prev.filter(member => member.id !== id));
    setSuccess('Sales team member removed successfully');
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

  const filteredMembers = salesMembers.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.territory.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTeam = selectedTeam === 'all' || member.role === selectedTeam;
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
            <button
              onClick={handleAddMember}
              className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white text-sm font-medium rounded-lg hover:bg-[#0a52c0] transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              Add Sales Rep
            </button>
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
                className="w-full pl-10 pr-4 py-2 border text-sm text-black border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
              />
            </div>
            <div className="relative">
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="appearance-none bg-white border text-sm text-black border-gray-300 rounded-lg px-4 py-2 pr-8 focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
              >
                <option value="all">All Roles</option>
                <option value="Sales Manager">Sales Manager</option>
                <option value="Sales Rep">Sales Rep</option>
                <option value="Sales Support">Sales Support</option>
                <option value="Lead Gen">Lead Gen</option>
                <option value="Account Manager">Account Manager</option>
              </select>
              <ChevronDown className="h-4 w-4 absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
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
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => window.open(`mailto:${member.email}`)}
                    className="p-2 text-gray-400 hover:text-[#0a61d7] transition-colors"
                    title="Send email"
                  >
                    <Mail className="h-4 w-4" />
                  </button>
                  {member.phone && (
                    <button
                      onClick={() => window.open(`tel:${member.phone}`)}
                      className="p-2 text-gray-400 hover:text-[#0a61d7] transition-colors"
                      title="Call"
                    >
                      <Phone className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleEditMember(member)}
                    className="p-2 text-gray-400 hover:text-[#0a61d7] transition-colors"
                    title="Edit"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteMember(member.id)}
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
