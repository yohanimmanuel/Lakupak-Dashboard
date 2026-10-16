'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, User, Package, FileText, Target, CheckCircle, AlertCircle } from 'lucide-react';
import BasicProfileInfo from '@/components/sales/BasicProfileInfo';
import FavouriteProducts from '@/components/sales/FavouriteProducts';
import SalesReporting from '@/components/sales/SalesReporting';
import SalesTarget from '@/components/sales/SalesTarget';
import { SalesAgent } from '@/components/sales/TeamList';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useSalesTranslations } from '@/hooks/useSalesTranslations';
import { SkeletonWizardPage } from '@/components/skeleton/SkeletonWizardPage';

type TabId = 'profile' | 'products' | 'reporting' | 'target';

const TAB_IDS: TabId[] = ['profile', 'products', 'reporting', 'target'];

const TAB_ICONS: Record<TabId, React.ReactNode> = {
  profile: <User className="w-5 h-5" />,
  products: <Package className="w-5 h-5" />,
  reporting: <FileText className="w-5 h-5" />,
  target: <Target className="w-5 h-5" />,
};

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  description: string;
}

export default function EditSalesAgentPage() {
  const { tAgentForm, translateWizardTab, translateWizardTabDesc } = useSalesTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentId = searchParams?.get('id') ?? null;
  
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const user = useUserStore(state => state.user);

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

  const tabs: Tab[] = TAB_IDS.map((id) => ({
    id,
    label: translateWizardTab(id),
    icon: TAB_ICONS[id],
    description: translateWizardTabDesc(id),
  }));

  const GET_SALES_AGENT_QUERY = `
    query GetSalesAgent($userId: Int!, $id: String!) {
      salesAgent(userId: $userId, id: $id) {
        id
        name
        email
        phone
        role
        status
        avatar
        territory
        bio
        sex
        teamId
        teamName
        favoriteProducts {
          productId
          productDbId
          name
          productType
          brand
          images
          sellingPrice
        }
        fieldReports {
          id
          date
          location
          startTime
          endTime
          activities
          notes
        }
        salesTargets {
          id
          period
          goal
          achieved
          unitsSold
        }
      }
    }
  `;

  // Fetch agent data
  useEffect(() => {
    if (!agentId || !user?.id) {
      if (!agentId) router.push('/sales/team');
      return;
    }

    const fetchAgent = async () => {
      setLoading(true);
      try {
        const data = await fetchGraphQL<{
          salesAgent: SalesAgent | null;
        }>(GET_SALES_AGENT_QUERY, {
          userId: user.id,
          id: agentId,
        });

        if (!data.salesAgent) {
          alert(tAgentForm('alerts.notFound'));
          router.push('/sales/team');
          return;
        }

        setFormData({
          id: data.salesAgent.id,
          name: data.salesAgent.name,
          email: data.salesAgent.email,
          phone: data.salesAgent.phone,
          role: data.salesAgent.role,
          status: data.salesAgent.status,
          territory: data.salesAgent.territory,
          avatar: data.salesAgent.avatar,
          bio: data.salesAgent.bio,
          sex: data.salesAgent.sex,
          teamId: data.salesAgent.teamId,
          teamName: data.salesAgent.teamName,
          favoriteProducts: data.salesAgent.favoriteProducts || [],
          fieldReports: data.salesAgent.fieldReports || [],
          salesTargets: data.salesAgent.salesTargets || [],
        });
      } catch (error) {
        console.error('Error fetching agent:', error);
        alert(error instanceof Error ? error.message : tAgentForm('alerts.loadFailed'));
        router.push('/sales/team');
      } finally {
        setLoading(false);
      }
    };

    fetchAgent();
    // router is stable, only need agentId and user?.id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, user?.id]);

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

  const UPDATE_SALES_AGENT_MUTATION = `
    mutation UpdateSalesAgent($userId: Int!, $input: UpdateSalesAgentInput!) {
      updateSalesAgent(userId: $userId, input: $input) {
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

  const handleSave = async () => {
    if (!isReadyToSave) {
      alert(tAgentForm('validation.completeBeforeSave'));
      return;
    }

    if (!user?.id || !agentId) {
      alert(tAgentForm('validation.notAuthenticatedOrMissingId'));
      return;
    }

    setIsSaving(true);
    try {
      // Prepare field reports (id is optional, only include if it exists)
      const fieldReports = (formData.fieldReports || []).map(report => {
        const reportData: {
          id?: string;
          date: string;
          location?: string | null;
          startTime?: string | null;
          endTime?: string | null;
          activities?: Record<string, unknown> | null;
          notes?: string | null;
        } = {
          date: report.date,
          location: report.location || null,
          startTime: report.startTime || null,
          endTime: report.endTime || null,
          activities: report.activities || null,
          notes: report.notes || null,
        };
        // Only include id if it exists (for updates)
        if (report.id) {
          reportData.id = report.id;
        }
        return reportData;
      });

      // Prepare sales targets (id is optional, only include if it exists)
      const salesTargets = (formData.salesTargets || []).map(target => {
        const targetData: {
          id?: string;
          period: string;
          goal: number;
          achieved: number;
          unitsSold: number;
        } = {
          period: target.period,
          goal: target.goal,
          achieved: target.achieved || 0,
          unitsSold: target.unitsSold || 0,
        };
        // Only include id if it exists (for updates)
        if (target.id) {
          targetData.id = target.id;
        }
        return targetData;
      });

      // Prepare favorite product IDs (database IDs)
      const favoriteProductIds = (formData.favoriteProducts || [])
        .map(fp => fp.productDbId)
        .filter((id): id is number => id !== undefined && id !== null);

      const result = await fetchGraphQL<{
        updateSalesAgent: SalesAgent;
      }>(UPDATE_SALES_AGENT_MUTATION, {
        userId: user.id,
        input: {
          id: agentId,
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          role: formData.role,
          status: formData.status,
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

      if (result.updateSalesAgent) {
        router.push(`/sales/team/details?id=${agentId}`);
      }
    } catch (error) {
      console.error('Error updating agent:', error);
      alert(error instanceof Error ? error.message : tAgentForm('alerts.updateFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (agentId) {
      router.push(`/sales/team/details?id=${agentId}`);
    } else {
      router.push('/sales/team');
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
    return <SkeletonWizardPage tabs={4} actions={1} />;
  }

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col space-y-4 bg-gradient-to-b from-gray-50 to-white p-4">
      {/* Header */}
      <div className="flex min-w-0 flex-col gap-3 @5xl/main:flex-row @5xl/main:items-start @5xl/main:justify-between">
        <div className="flex min-w-0 flex-col gap-3 @3xl/main:flex-row @3xl/main:items-start">
          <button
            type="button"
            onClick={handleCancel}
            className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 @3xl/main:w-auto @3xl/main:justify-start"
          >
            <ArrowLeft className="h-4 w-4" />
            {tAgentForm('backToDetails')}
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-black">{tAgentForm('editTitle')}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${tabCompletion.profile ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-xs text-gray-600">{tAgentForm('statusIndicators.profile')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${tabCompletion.products ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-xs text-gray-600">{tAgentForm('statusIndicators.products')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${tabCompletion.reporting ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-xs text-gray-600">{tAgentForm('statusIndicators.reporting')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${tabCompletion.target ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-xs text-gray-600">{tAgentForm('statusIndicators.target')}</span>
              </div>
              {!isReadyToSave && (
                <div className="flex items-center gap-1 text-amber-600">
                  <AlertCircle className="h-3 w-3" />
                  <span className="text-xs">{tAgentForm('completeRequiredFields')}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !isReadyToSave}
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition @4xl/main:w-auto ${
            isReadyToSave && !isSaving
              ? 'bg-[#0a61d7] text-white hover:bg-[#084ba6]'
              : 'cursor-not-allowed bg-gray-300 text-gray-500'
          }`}
        >
          {isSaving ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              {tAgentForm('saving')}
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4" />
              {tAgentForm('saveChanges')}
            </>
          )}
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="rounded-lg border border-[#e6e6e6] bg-white p-1">
        <div className="flex flex-col gap-1 @5xl/main:flex-row">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-3 rounded-md px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#0a61d7] text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-black'
              }`}
            >
              {tab.icon}
              <div className="min-w-0 text-left">
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

