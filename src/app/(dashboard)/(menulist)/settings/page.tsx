'use client';

import { SkeletonSettingsPage } from '@/components/skeleton/SkeletonSettingsPage';
import React, { useState } from 'react';
import { User, Shield, Globe, CreditCard, Users, Building2, Sparkles } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { useAuthHydration } from '@/hooks/useAuthHydration';
import { useSettingsTranslations } from '@/hooks/useSettingsTranslations';
import GeneralInfo from '@/components/accountsettings/GeneralInfo';
import DistributorOperations from '@/components/accountsettings/DistributorOperations';
import SecurityPass from '@/components/accountsettings/SecurityPass';
import LanguageRegion from '@/components/accountsettings/LanguageRegion';
import BillingPayment from '@/components/accountsettings/BillingPayment';
import TeamManagement from '@/components/accountsettings/TeamManagement';
import { DashboardToursPanel } from '@/components/tours/DashboardToursPanel';

type SettingsTab = 'general' | 'security' | 'language' | 'billing' | 'team' | 'profile' | 'tours';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const { user } = useUserStore();
  const { isHydrated } = useAuthHydration();
  const { tPage } = useSettingsTranslations();

  const settingsTabs: { id: SettingsTab; tabKey: SettingsTab | 'profile'; icon: React.ReactNode }[] = [
    { id: 'general', tabKey: 'general', icon: <User className="w-4 h-4" /> },
    { id: 'profile', tabKey: 'profile', icon: <Building2 className="w-4 h-4" /> },
    { id: 'tours', tabKey: 'tours', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'team', tabKey: 'team', icon: <Users className="w-4 h-4" /> },
    { id: 'language', tabKey: 'language', icon: <Globe className="w-4 h-4" /> },
    { id: 'billing', tabKey: 'billing', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'security', tabKey: 'security', icon: <Shield className="w-4 h-4" /> },
  ];

  if (!isHydrated || !user) {
    return <SkeletonSettingsPage />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralInfo />;
      case 'security':
        return <SecurityPass />;
      case 'language':
        return <LanguageRegion />;
      case 'billing':
        return <BillingPayment />;
      case 'team':
        return <TeamManagement />;
      case 'tours':
        return <DashboardToursPanel />;
      case 'profile':
        return <DistributorOperations />;
      default:
        return <GeneralInfo />;
    }
  };

  return (
    <div className="w-full mx-auto bg-gradient-to-b from-gray-50 to-white min-h-screen">
      <div className="p-4 border-b border-gray-200 bg-white">
        <h1 className="text-2xl font-bold text-black mb-2">{tPage('title')}</h1>
        <p className="text-sm text-gray-600">{tPage('subtitle')}</p>
      </div>

      <div className="flex">
        <div className="w-60 bg-white border-r border-gray-200 min-h-screen">
          <nav className="p-4">
            <div className="space-y-1">
              {settingsTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? 'bg-[#0a61d7] text-white'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {tab.icon}
                  {tPage(`tabs.${tab.tabKey}`)}
                </button>
              ))}
            </div>
          </nav>
        </div>

        <div className="flex-1">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
