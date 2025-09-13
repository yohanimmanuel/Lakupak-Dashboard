'use client';

import React, { useState, useEffect } from 'react';
import { User, Shield, Globe, CreditCard, Users, Building2 } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import GeneralInfo from '@/components/accountsettings/GeneralInfo';
import DistributorProfile from '@/components/accountsettings/DistributorProfile';
import SecurityPass from '@/components/accountsettings/SecurityPass';
import LanguageRegion from '@/components/accountsettings/LanguageRegion';

type SettingsTab = 'general' | 'security' | 'language' | 'billing' | 'team' | 'profile';

const settingsTabs = [
  { id: 'general' as const, label: 'General Info', icon: <User className="w-4 h-4" /> },
  { id: 'profile' as const, label: 'Company Profile', icon: <Building2 className="w-4 h-4" /> },
  { id: 'security' as const, label: 'Security & Password', icon: <Shield className="w-4 h-4" /> },
  { id: 'language' as const, label: 'Language & Region', icon: <Globe className="w-4 h-4" /> },
  { id: 'billing' as const, label: 'Billing & Payment', icon: <CreditCard className="w-4 h-4" /> },
  { id: 'team' as const, label: 'Team Management', icon: <Users className="w-4 h-4" /> },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const { user, isAuthenticated } = useUserStore();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);


  // Show loading state while user data is being loaded
  if (!isClient || !user) {
    return (
      <div className="w-full mx-auto bg-gradient-to-b from-gray-50 to-white min-h-screen">
        <div className="p-4 border-b border-gray-200 bg-white">
          <h1 className="text-2xl font-bold text-black mb-2">Account Settings</h1>
          <p className="text-sm text-gray-600">Manage your account preferences and settings</p>
        </div>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-pulse text-center">
            <div className="h-8 bg-gray-200 rounded w-48 mb-4 mx-auto"></div>
            <div className="text-gray-500">Loading your settings...</div>
          </div>
        </div>
      </div>
    );
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
        return <div className="p-8 text-center text-gray-500">Billing & Payment settings coming soon...</div>;
      case 'team':
        return <div className="p-8 text-center text-gray-500">Team Management settings coming soon...</div>;
      case 'profile':
        return <DistributorProfile />;
      default:
        return <GeneralInfo />;
    }
  };

  return (
    <div className="w-full mx-auto bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <h1 className="text-2xl font-bold text-black mb-2">Account Settings</h1>
        <p className="text-sm text-gray-600">Manage your account preferences and settings</p>
      </div>

      <div className="flex">
        {/* Settings Navigation Sidebar */}
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
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>
        </div>

        {/* Main Content Area */}
        <div className="flex-1">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
