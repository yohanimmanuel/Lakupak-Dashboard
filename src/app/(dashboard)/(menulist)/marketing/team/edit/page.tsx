'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, User, Package, FileText, Target, CheckCircle, AlertCircle } from 'lucide-react';
import BasicProfileInfo from '@/components/salesmarketing/BasicProfileInfo';
import FavouriteProducts from '@/components/salesmarketing/FavouriteProducts';
import SalesReporting from '@/components/salesmarketing/SalesReporting';
import SalesTarget from '@/components/salesmarketing/SalesTarget';
import { SalesAgent } from '@/components/salesmarketing/TeamList';

type TabId = 'profile' | 'products' | 'reporting' | 'target';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  description: string;
}

export default function EditSalesAgentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentId = searchParams.get('id');
  
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [formData, setFormData] = useState<Partial<SalesAgent>>({
    name: '',
    email: '',
    phone: '',
    role: 'Sales Rep',
    status: 'active',
    territory: '',
    salesTarget: undefined,
    currentSales: undefined,
    avatar: undefined,
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

  // Fetch agent data
  useEffect(() => {
    if (!agentId) {
      router.push('/marketing/team');
      return;
    }

    const fetchAgent = async () => {
      setLoading(true);
      try {
        // In production, replace with actual API call:
        // const data = await fetchGraphQL(GET_AGENT_QUERY, { id: agentId });
        
        // For now, using sample data
        const sampleAgent: SalesAgent = {
          id: agentId,
          name: 'Sarah Johnson',
          email: 'sarah.johnson@laku.com',
          phone: '+62 21 1234 5678',
          role: 'Sales Manager',
          status: 'active',
          territory: 'Jakarta & West Java',
          salesTarget: 50000000,
          currentSales: 42000000,
        };

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 500));
        
        setFormData({
          name: sampleAgent.name || '',
          email: sampleAgent.email || '',
          phone: sampleAgent.phone || '',
          role: sampleAgent.role || 'Sales Rep',
          status: sampleAgent.status || 'active',
          territory: sampleAgent.territory || '',
          salesTarget: sampleAgent.salesTarget,
          currentSales: sampleAgent.currentSales,
          avatar: sampleAgent.avatar,
        });
      } catch (error) {
        console.error('Error fetching agent:', error);
        alert('Failed to load agent data');
        router.push('/marketing/team');
      } finally {
        setLoading(false);
      }
    };

    fetchAgent();
  }, [agentId, router]);

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

  const isReadyToSave = validateForm();

  const handleSave = async () => {
    if (!isReadyToSave) {
      alert('Please complete all required fields before saving.');
      return;
    }

    setIsSaving(true);
    try {
      // In production, replace with actual API call:
      // await fetchGraphQL(UPDATE_AGENT_MUTATION, { id: agentId, ...formData });
      
      // For now, just log and redirect
      console.log('Updating agent:', agentId, formData);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      router.push(`/marketing/team/details?id=${agentId}`);
    } catch (error) {
      console.error('Error updating agent:', error);
      alert('Failed to update agent. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (agentId) {
      router.push(`/marketing/team/details?id=${agentId}`);
    } else {
      router.push('/marketing/team');
    }
  };

  const renderActiveComponent = () => {
    const commonProps = {
      formData,
      onFormChange: handleFormChange,
      onTabCompletion: handleTabCompletion,
      mode: 'edit' as const,
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

  if (loading) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading agent data...</p>
        </div>
      </div>
    );
  }

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
            Back to Details
          </button>
          <div>
            <h1 className="text-2xl font-bold text-black">Edit Sales Agent</h1>
            <p className="text-gray-500 text-sm">Update agent information</p>
            
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
              {!isReadyToSave && (
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
          disabled={isSaving || !isReadyToSave}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition text-sm ${
            isReadyToSave && !isSaving
              ? 'bg-[#0a61d7] text-white hover:bg-[#084ba6]'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isSaving ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Saving...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Save Changes
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
      <div className="bg-white rounded-lg border border-[#e6e6e6] shadow-sm p-4">
        {renderActiveComponent()}
      </div>
    </div>
  );
}

