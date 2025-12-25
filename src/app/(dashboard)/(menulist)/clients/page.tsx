'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Users, 
  X, 
  ArrowRight,
  UserPlus,
  Handshake,
  Building2
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ClientTip {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  actionLink: string;
  mainPurpose?: string;
  fullDetails?: string[];
}

export default function ClientsPage() {
  const [dismissedTips, setDismissedTips] = useState<Set<string>>(new Set());
  const [selectedTip, setSelectedTip] = useState<ClientTip | null>(null);

  const highPriorityTips: ClientTip[] = [
    {
      id: 'add-new-buyers',
      icon: UserPlus,
      title: 'Add New Buyers',
      description: 'Expand your customer network by adding new buyers to your client list. Building a strong buyer base helps increase sales and revenue growth.',
      actionLabel: 'Add buyers',
      actionLink: '/clients/buyers',
      mainPurpose: 'Expand your customer base and increase sales opportunities by systematically adding new buyers to your network. Buyers who bought products from you are considered as your clients and recorded automatically from the marketplace to the dashboard.',
      fullDetails: [
        'Access the Buyers section to view your current client list and add new contacts',
        'Automatically record complete buyer information including store name, contact details, and business address',
        'Categorize buyers by business type to better understand your customer segments',
        'Set buyer status to track active, inactive, or potential clients',
        'Import multiple buyers at once using bulk import functionality'
      ],
    },
    {
      id: 'manage-suppliers',
      icon: Building2,
      title: 'Manage Suppliers',
      description: 'Keep your supplier information up to date to ensure smooth procurement. Track supply details and maintain accurate product sourcing.',
      actionLabel: 'Manage suppliers',
      actionLink: '/clients/suppliers',
      mainPurpose: 'Maintain accurate supplier relationships and ensure reliable product sourcing for your business operations. Suppliers provide your products and services to your customers. You may also add new suppliers to your network to keep your supply record up to date without managing different suppliers through different software applications.',
      fullDetails: [
        'Store supplier contact information, business details, and addresses up to date',
        'Track supply details including products they provide and pricing agreements',
        'Monitor supplier performance metrics such as delivery times and reliability',
        'Record logistics preferences and shipping arrangements for each supplier',
        'Maintain notes about supplier terms, conditions, and special agreements',
        'Update supplier status to reflect active partnerships or changes',
        'Use supplier data to optimize procurement decisions and inventory planning'
      ],
    }
  ];

  const clientTools = [
    {
      id: 'buyers',
      name: 'Buyers',
      description: 'Manage your buyer network and track customer relationships.',
      icon: Users,
      link: '/clients/buyers',
    },
    {
      id: 'suppliers',
      name: 'Suppliers',
      description: 'Manage your supplier network and procurement relationships.',
      icon: Building2,
      link: '/clients/suppliers',
    },
  ];


  const handleDismissTip = (tipId: string) => {
    setDismissedTips((prev) => new Set(prev).add(tipId));
  };

  const visibleTips = highPriorityTips.filter((tip) => !dismissedTips.has(tip.id));

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-black mb-2">Clients</h1>
        <p className="text-sm text-gray-600">
          Manage your buyer and supplier relationships to build a strong network and drive business growth.
        </p>
      </div>

      {/* Tips Section */}
      {visibleTips.length > 0 && (
        <section className="mb-8">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-black">Tips</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleTips.map((tip) => {
              const IconComponent = tip.icon;
              return (
                <div
                  key={tip.id}
                  className="relative rounded-lg border border-gray-100 bg-blue-50 p-4 shadow-sm transition-shadow hover:shadow"
                >
                  <button
                    onClick={() => handleDismissTip(tip.id)}
                    className="absolute top-3 right-3 p-1 hover:bg-blue-100 rounded-full transition-colors"
                    aria-label="Dismiss tip"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                  <div className="flex items-start gap-3 pr-6">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-[#0a61d7]">
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <button
                        onClick={() => setSelectedTip(tip)}
                        className="text-sm font-semibold text-black mb-1 hover:text-[#0a61d7] transition-colors text-left"
                      >
                        {tip.title}
                      </button>
                      <p className="text-xs text-gray-600 mb-3">
                        {tip.description}
                      </p>
                      <Link
                        href={tip.actionLink}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6] transition-colors"
                      >
                        {tip.actionLabel}
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Tools Section */}
      <section>
        <h2 className="text-lg font-semibold text-black mb-4">Tools</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clientTools.map((tool) => {
            const IconComponent = tool.icon;
            return (
              <Link
                key={tool.id}
                href={tool.link}
                className="group rounded-lg border border-gray-100 bg-white p-6 shadow-sm transition-all hover:shadow hover:border-[#0a61d7]"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-lg bg-[#f7faff] flex items-center justify-center text-[#0a61d7] mb-4 group-hover:bg-[#0a61d7] group-hover:text-white transition-colors">
                    <IconComponent className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold text-black mb-2">
                    {tool.name}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {tool.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Tip Detail Modal */}
      {selectedTip && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedTip(null);
            }
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-[#0a61d7]">
                  {(() => {
                    const IconComponent = selectedTip.icon;
                    return <IconComponent className="w-5 h-5" />;
                  })()}
                </div>
                <h2 className="text-xl font-bold text-black">
                  {selectedTip.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedTip(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
              <div className="space-y-6">
                {/* Main Purpose */}
                {selectedTip.mainPurpose && (
                  <div>
                    <h3 className="text-base font-semibold text-black mb-2">Main Purpose</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {selectedTip.mainPurpose}
                    </p>
                  </div>
                )}

                 {/* Full Details */}
                 {selectedTip.fullDetails && selectedTip.fullDetails.length > 0 && (
                   <div>
                     <h3 className="text-base font-semibold text-black mb-3">Details</h3>
                     <ul className="space-y-2">
                       {selectedTip.fullDetails.map((detail, index) => (
                         <li key={index} className="flex items-start gap-3">
                           <span className="text-[#0a61d7] flex-shrink-0 mt-0.5">•</span>
                           <span className="text-sm text-gray-600 leading-relaxed flex-1">
                             {detail}
                           </span>
                         </li>
                       ))}
                     </ul>
                   </div>
                 )}

                 {/* Action Button */}
                 <div className="pt-4 -mx-6 px-6 border-t border-gray-200">
                  <Link
                    href={selectedTip.actionLink}
                    onClick={() => setSelectedTip(null)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors text-sm font-semibold"
                  >
                    {selectedTip.actionLabel}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

