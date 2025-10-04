'use client';

import React, { useState } from 'react';
import { ArrowLeft, BarChart3, Target, Package, Calendar, Save, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/userStore';
import OfferAnalytics from '@/components/offersincentivesdisc/OfferAnalytics';
import OfferType from '@/components/offersincentivesdisc/OfferType';
import ProductIntegration from '@/components/offersincentivesdisc/ProductIntegration';
import RangeManagement from '@/components/offersincentivesdisc/RangeManagement';

export default function CreateOfferPage() {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const [activeTab, setActiveTab] = useState<'analytics' | 'type' | 'products' | 'range'>('type');
  const [isCreating, setIsCreating] = useState(false);

  const tabs = [
    { 
      id: 'type', 
      label: 'Offer Type', 
      icon: <Target className="w-5 h-5" />,
      description: 'Discount types and rules'
    },
    { 
      id: 'range', 
      label: 'Date Range', 
      icon: <Calendar className="w-5 h-5" />,
      description: 'Time periods and scheduling'
    },
    { 
      id: 'products', 
      label: 'Products', 
      icon: <Package className="w-5 h-5" />,
      description: 'Product selection and targeting'
    },
    { 
      id: 'analytics', 
      label: 'Analytics', 
      icon: <BarChart3 className="w-5 h-5" />,
      description: 'Performance metrics analysis'
    },
  ];

  const handleSaveOffer = async () => {
    setIsCreating(true);
    // TODO: Implement offer creation logic
    setTimeout(() => {
      setIsCreating(false);
      router.push('/offers');
    }, 2000);
  };

  const handleCancel = () => {
    router.push('/offers');
  };

  const renderActiveComponent = () => {
    switch (activeTab) {
      case 'analytics':
        return <OfferAnalytics {...({ isNewOffer: true } as any)} />;
      case 'type':
        return <OfferType {...({ isNewOffer: true } as any)} />;
      case 'products':
        return <ProductIntegration {...({ isNewOffer: true } as any)} />;
      case 'range':
        return <RangeManagement {...({ isNewOffer: true } as any)} />;
      default:
        return <OfferAnalytics {...({ isNewOffer: true } as any)} />;
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
            Back to Offers
          </button>
          <div>
            <h1 className="text-2xl font-bold text-black">Create New Offer</h1>
            <p className="text-gray-500 text-sm">Advanced offer management and analytics</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveOffer}
            disabled={isCreating}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm"
          >
            {isCreating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Creating...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Create Offer
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg border border-[#e6e6e6] p-1">
        <div className="flex flex-col lg:flex-row gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
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
      <div className="bg-white rounded-lg border border-[#e6e6e6] shadow-sm">
        {renderActiveComponent()}
      </div>
    </div>
  );
}