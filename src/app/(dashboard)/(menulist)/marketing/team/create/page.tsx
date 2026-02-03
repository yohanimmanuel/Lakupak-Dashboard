'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User, Package, FileText, Target, CheckCircle, AlertCircle } from 'lucide-react';
import BasicProfileInfo from '@/components/salesmarketing/BasicProfileInfo';
import FavouriteProducts from '@/components/salesmarketing/FavouriteProducts';
import SalesReporting from '@/components/salesmarketing/SalesReporting';
import SalesTarget from '@/components/salesmarketing/SalesTarget';
import { SalesAgent } from '@/components/salesmarketing/TeamList';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';

type TabId = 'profile' | 'products' | 'reporting' | 'target';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const CREATE_SALES_AGENT_MUTATION = `
  mutation CreateSalesAgent($userId: Int!, $input: CreateSalesAgentInput!) {
    createSalesAgent(userId: $userId, input: $input) {
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
  }
`;

export default function CreateSalesAgentPage() {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [isCreating, setIsCreating] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState<Partial<SalesAgent>>({
    name: '',
    email: '',
    phone: '',
    role: 'Sales Rep',
    status: 'active',
    territory: '',
    avatar: undefined,
    favoriteProducts: [],
    fieldReports: [],
    salesTargets: [],
  });

  // Tab completion status
  const [tabCompletion, setTabCompletion] = useState({
    profile: false,
    products: false,
    reporting: false,
    target: false,
  });

  const tabs: Tab[] = [
    {
      id: 'profile',
      label: 'Basic Profile',
      icon: <User className="w-5 h-5" />,
      description: 'Personal and contact information',
    },
    {
      id: 'products',
      label: 'Favourite Products',
      icon: <Package className="w-5 h-5" />,
      description: 'Products to be sold',
    },
    {
      id: 'reporting',
      label: 'Sales Reporting',
      icon: <FileText className="w-5 h-5" />,
      description: 'Reporting preferences',
    },
    {
      id: 'target',
      label: 'Sales Target',
      icon: <Target className="w-5 h-5" />,
      description: 'Sales goals and targets',
    },
  ];

  const handleFormChange = useCallback((updates: Partial<SalesAgent>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  const handleTabCompletion = useCallback((tabId: TabId, isComplete: boolean) => {
    setTabCompletion(prev => {
      // Only update if the value actually changed to prevent infinite loops
      if (prev[tabId] === isComplete) return prev;
      return { ...prev, [tabId]: isComplete };
    });
  }, []);

  const validateForm = (): boolean => {
    const isProfileComplete = Boolean(
      formData.name?.trim() &&
      formData.email?.trim() &&
      formData.phone?.trim() &&
      formData.role
    );
    
    return isProfileComplete;
  };

  const isReadyToCreate = validateForm();

  const handleSave = async () => {
    if (!isReadyToCreate) {
      alert('Please complete all required fields before creating the agent.');
      return;
    }

    if (!user?.id) {
      alert('User not authenticated');
      return;
    }

    setIsCreating(true);
    try {
      // Prepare field reports
      const fieldReports = (formData.fieldReports || []).map(report => ({
        date: report.date,
        location: report.location,
        startTime: report.startTime,
        endTime: report.endTime,
        activities: report.activities || null,
        notes: report.notes,
      }));

      // Prepare sales targets
      const salesTargets = (formData.salesTargets || []).map((target: { id?: string; period: string; goal: number; achieved?: number; unitsSold?: number }) => ({
        period: target.period,
        goal: target.goal,
        achieved: target.achieved || 0,
        unitsSold: target.unitsSold || 0,
      }));

      // Prepare favorite product IDs (database IDs)
      const favoriteProductIds = (formData.favoriteProducts || [])
        .map(fp => fp.productDbId)
        .filter((id): id is number => id !== undefined && id !== null);

      const result = await fetchGraphQL<{
        createSalesAgent: SalesAgent;
      }>(CREATE_SALES_AGENT_MUTATION, {
        userId: user.id,
        input: {
          name: formData.name!,
          email: formData.email!,
          phone: formData.phone!,
          role: formData.role!,
          status: formData.status || 'active',
          avatar: formData.avatar || null,
          territory: formData.territory || null,
          bio: formData.bio || null,
          sex: formData.sex || null,
          teamId: formData.teamId || null,
          fieldReports: fieldReports.length > 0 ? fieldReports : null,
          salesTargets: salesTargets.length > 0 ? salesTargets : null,
          favoriteProductIds: favoriteProductIds.length > 0 ? favoriteProductIds : null,
        },
      });

      if (result.createSalesAgent) {
        router.push('/marketing/team');
      }
    } catch (error) {
      console.error('Error creating agent:', error);
      alert(error instanceof Error ? error.message : 'Failed to create agent. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    router.push('/marketing/team');
  };

  const renderActiveComponent = () => {
    const commonProps = {
      formData,
      onFormChange: handleFormChange,
      onTabCompletion: handleTabCompletion,
      mode: 'create' as const,
    };

    switch (activeTab) {
      case 'profile':
        return <BasicProfileInfo {...commonProps} />;
      case 'products':
        return <FavouriteProducts {...commonProps} />;
      case 'reporting':
        return <SalesReporting {...commonProps} />;
      case 'target':
        return <SalesTarget {...commonProps} />;
      default:
        return <BasicProfileInfo {...commonProps} />;
    }
  };

  return (
    <div className="p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleCancel}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Team
          </button>
          <div>
            <h1 className="text-2xl font-bold text-black">Create New Sales Agent</h1>
            <p className="text-gray-500 text-sm">Add a new sales agent to your team</p>
            
            {/* Status Indicator */}
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${tabCompletion.profile ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-xs text-gray-600">Profile</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${tabCompletion.products ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-xs text-gray-600">Products</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${tabCompletion.reporting ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-xs text-gray-600">Reporting</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${tabCompletion.target ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-xs text-gray-600">Target</span>
              </div>
              {!isReadyToCreate && (
                <div className="flex items-center gap-1 text-amber-600">
                  <AlertCircle className="w-3 h-3" />
                  <span className="text-xs">Complete required fields</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <button
          onClick={handleSave}
          disabled={isCreating || !isReadyToCreate}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition text-sm ${
            isReadyToCreate && !isCreating
              ? 'bg-[#0a61d7] text-white hover:bg-[#084ba6]'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isCreating ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Creating...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Create Agent
            </>
          )}
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-1">
        <div className="flex flex-col lg:flex-row gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${
                activeTab === tab.id
                  ? 'bg-[#0a61d7] text-white'
                  : 'text-gray-600 hover:text-black hover:bg-gray-100'
              }`}
            >
              {tab.icon}
              <div className="text-left">
                <div>{tab.label}</div>
                <div className={`text-xs ${
                  activeTab === tab.id ? 'text-white/80' : 'text-gray-400'
                }`}>
                  {tab.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
        {renderActiveComponent()}
      </div>
    </div>
  );
}

