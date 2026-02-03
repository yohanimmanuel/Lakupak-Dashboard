'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Users, 
  Megaphone, 
  Zap, 
  X, 
  ArrowRight,
  UserPlus,
  Gift,
  ShoppingCart
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface MarketingTip {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  actionLink: string;
  mainPurpose?: string;
  fullDetails?: string[];
}

export default function MarketingPage() {
  const [dismissedTips, setDismissedTips] = useState<Set<string>>(new Set());
  const [selectedTip, setSelectedTip] = useState<MarketingTip | null>(null);

  const marketingTips: MarketingTip[] = [
    {
      id: 'new-customers',
      icon: UserPlus,
      title: 'Invite New Customers',
      description: 'Reach out to potential buyers who recently joined the platform to expand your customer base. Building relationships early can lead to long-term partnerships and increased order volume.',
      actionLabel: 'Invite customers',
      actionLink: '/clients',
      mainPurpose: 'Grow your customer base by proactively reaching out to new buyers who recently joined the platform and converting them into active customers. Reach out to new buyers who have recently registered on the platform and send them personalized invitations to showcase your product catalog and services.',
      fullDetails: [
        'Identify potential buyers who have recently registered on the platform',
        'Send personalized invitations to showcase your product catalog and services',
        'Highlight unique value propositions and competitive advantages',
        'Offer welcome incentives or special discounts for first-time orders',
        'Build initial relationships through direct communication and follow-up',
        'Track invitation responses and conversion rates',
        'Convert new platform users into loyal, repeat customers'
      ],
    },
    {
      id: 'promotions',
      icon: Gift,
      title: 'Create Promotions',
      description: 'Boost your sales by creating special offers and discounts for your products. Set up percentage discounts, fixed amount reductions, or bundle deals to attract buyers and drive immediate sales.',
      actionLabel: 'Create promotion',
      actionLink: '/offers',
      mainPurpose: 'Create percentage-based discounts for selected products or categories, set up fixed amount reductions for specific items, design bundle deals and buy-one-get-one promotions, define promotion periods with start and end dates, target specific customer segments or buyer groups, set minimum order quantities or spending thresholds, track promotion performance and conversion metrics, schedule promotions for peak seasons or special events.',
      fullDetails: [
        'Create percentage-based discounts for selected products or categories',
        'Set up fixed amount reductions for specific items',
        'Design bundle deals and buy-one-get-one promotions',
        'Define promotion periods with start and end dates',
        'Target specific customer segments or buyer groups',
        'Set minimum order quantities or spending thresholds',
        'Track promotion performance and conversion metrics',
        'Schedule promotions for peak seasons or special events'
      ],
    },
    {
      id: 'cart-reminders',
      icon: ShoppingCart,
      title: 'Cart Abandonment',
      description: 'Follow up with customers who added products to their cart but haven\'t completed their purchase. Cart abandonment campaigns can recover lost sales by sending timely reminders and offering incentives.',
      actionLabel: 'View campaigns',
      actionLink: '/marketing/campaigns',
      mainPurpose: 'Identify customers and send automated reminder emails or notifications to WhatsApp Messaging, offer time-limited incentives or discounts to encourage completion, personalize follow-up messages based on cart contents. You can also create urgency with limited-time offers or stock availability alerts, A/B test different messaging and incentive strategies, convert abandoned carts into completed orders and revenue.',
      fullDetails: [
        'Identify customers with abandoned carts and incomplete purchases',
        'Send automated reminder emails or notifications',
        'Offer time-limited incentives or discounts to encourage completion',
        'Personalize follow-up messages based on cart contents',
        'Create urgency with limited-time offers or stock availability alerts',
        'Track cart abandonment rates and recovery success metrics',
        'A/B test different messaging and incentive strategies',
        'Convert abandoned carts into completed orders and revenue'
      ],
    },
  ];

  const marketingTools = [
    {
      id: 'teams',
      name: 'Teams',
      description: 'Manage your marketing team members and assign roles.',
      icon: Users,
      link: '/marketing/team',
    },
    {
      id: 'campaigns',
      name: 'Campaigns',
      description: 'Create and manage marketing campaigns to reach your customers.',
      icon: Megaphone,
      link: '/marketing/campaigns',
    },
    {
      id: 'automation',
      name: 'Automation',
      description: 'Set up automated marketing workflows and reminders.',
      icon: Zap,
      link: '/marketing/automation',
    },
  ];


  const handleDismissTip = (tipId: string) => {
    setDismissedTips((prev) => new Set(prev).add(tipId));
  };

  const visibleTips = marketingTips.filter((tip) => !dismissedTips.has(tip.id));

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-black mb-2">Marketing</h1>
        <p className="text-sm text-gray-600">
          Build customer relationships and drive orders with marketing opportunities, tools, and resources.
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
                  className="relative rounded-lg border border-[#e6e6e6] bg-blue-50 p-4"
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {marketingTools.map((tool) => {
            const IconComponent = tool.icon;
            return (
              <Link
                key={tool.id}
                href={tool.link}
                className="group rounded-lg border border-[#e6e6e6] bg-white p-6 transition-all hover:border-[#0a61d7]"
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
          <div className="bg-white rounded-lg border border-[#e6e6e6] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-[#e6e6e6] p-4 flex items-center justify-between">
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
              <div className="space-y-4">
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
                 <div className="pt-4 -mx-6 px-6 border-t border-[#e6e6e6]">
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

