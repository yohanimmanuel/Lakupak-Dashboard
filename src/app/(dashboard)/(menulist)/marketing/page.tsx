'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Users, 
  Megaphone, 
  Zap, 
  X, 
  ArrowRight,
  ArrowLeft,
  UserPlus,
  Gift,
  ShoppingCart,
  Package,
  FileText,
  Handshake,
  ChartBar,
  Store,
  TrendingUp
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface MarketingTip {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  actionLink: string;
}

export default function MarketingPage() {
  const [dismissedTips, setDismissedTips] = useState<Set<string>>(new Set());
  const [showAllTipsModal, setShowAllTipsModal] = useState(false);

  const marketingTips: MarketingTip[] = [
    {
      id: 'new-customers',
      icon: UserPlus,
      title: 'Invite New Customers',
      description: 'Reach out to potential buyers who recently joined the platform to expand your customer base. Building relationships early can lead to long-term partnerships and increased order volume.',
      actionLabel: 'Invite customers',
      actionLink: '/clients',
    },
    {
      id: 'promotions',
      icon: Gift,
      title: 'Create Promotions',
      description: 'Boost your sales by creating special offers and discounts for your products. Set up percentage discounts, fixed amount reductions, or bundle deals to attract buyers and drive immediate sales.',
      actionLabel: 'Create promotion',
      actionLink: '/offers',
    },
    {
      id: 'cart-reminders',
      icon: ShoppingCart,
      title: 'Cart Abandonment',
      description: 'Follow up with customers who added products to their cart but haven\'t completed their purchase. Cart abandonment campaigns can recover lost sales by sending timely reminders and offering incentives.',
      actionLabel: 'View campaigns',
      actionLink: '/marketing/campaigns',
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

  const allTipsByModule: { module: string; tips: MarketingTip[] }[] = [
    {
      module: 'Marketing',
      tips: marketingTips,
    },
    {
      module: 'Clients',
      tips: [
        {
          id: 'new-buyers',
          icon: UserPlus,
          title: 'Add New Buyers',
          description: 'Expand your customer network by adding new buyers to your client list. Track their order history and preferences to build stronger relationships.',
          actionLabel: 'Add buyers',
          actionLink: '/clients/buyers',
        },
        {
          id: 'supplier-network',
          icon: Handshake,
          title: 'Manage Suppliers',
          description: 'Keep your supplier information up to date to ensure smooth procurement. Track supply details and maintain accurate product sourcing.',
          actionLabel: 'Manage suppliers',
          actionLink: '/clients/suppliers',
        },
      ],
    },
    {
      module: 'Products',
      tips: [
        {
          id: 'product-catalog',
          icon: Package,
          title: 'Update Product Catalog',
          description: 'Regularly update your product catalog with accurate pricing and inventory levels. Keep product images and descriptions current to attract buyers.',
          actionLabel: 'Manage products',
          actionLink: '/products',
        },
        {
          id: 'low-stock',
          icon: TrendingUp,
          title: 'Monitor Low Stock',
          description: 'Set up inventory alerts to prevent stockouts. Keep your best-selling products well-stocked to maintain customer satisfaction.',
          actionLabel: 'View inventory',
          actionLink: '/products',
        },
      ],
    },
    {
      module: 'Orders',
      tips: [
        {
          id: 'pending-orders',
          icon: FileText,
          title: 'Process Pending Orders',
          description: 'Review and process pending orders to keep your fulfillment cycle running smoothly. Quick processing leads to faster delivery and happier customers.',
          actionLabel: 'View orders',
          actionLink: '/orders',
        },
      ],
    },
    {
      module: 'Offers',
      tips: [
        {
          id: 'seasonal-promotions',
          icon: Gift,
          title: 'Create Seasonal Promotions',
          description: 'Launch targeted promotions during peak seasons to maximize sales. Use discount strategies to clear inventory and attract new customers.',
          actionLabel: 'Create offers',
          actionLink: '/offers',
        },
      ],
    },
    {
      module: 'Analytics',
      tips: [
        {
          id: 'sales-insights',
          icon: ChartBar,
          title: 'Review Sales Analytics',
          description: 'Analyze your sales performance to identify trends and opportunities. Use data insights to make informed business decisions and optimize revenue.',
          actionLabel: 'View analytics',
          actionLink: '/analytics',
        },
      ],
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-black">Tips</h2>
            <button 
              onClick={() => setShowAllTipsModal(true)}
              className="text-sm font-medium text-[#0a61d7] hover:text-[#084ba6] transition-colors"
            >
              Show all
            </button>
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
                      <h3 className="text-sm font-semibold text-black mb-1">
                        {tip.title}
                      </h3>
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

      {/* All Tips Modal */}
      {showAllTipsModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAllTipsModal(false);
            }
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-black">
                Marketing Tips & Best Practices
              </h2>
              <button
                onClick={() => setShowAllTipsModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
              <div className="space-y-8">
                {allTipsByModule.map((moduleGroup) => (
                  <div key={moduleGroup.module}>
                    <h3 className="text-lg font-semibold text-black mb-4">
                      {moduleGroup.module}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {moduleGroup.tips.map((tip) => {
                        const IconComponent = tip.icon;
                        return (
                          <div
                            key={tip.id}
                            className="rounded-lg border border-gray-100 bg-blue-50 p-4 shadow-sm transition-shadow hover:shadow"
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-[#0a61d7]">
                                <IconComponent className="w-5 h-5" />
                              </div>
                              <div className="flex-1">
                                <h4 className="text-sm font-semibold text-black mb-1">
                                  {tip.title}
                                </h4>
                                <p className="text-xs text-gray-600 mb-3">
                                  {tip.description}
                                </p>
                                <Link
                                  href={tip.actionLink}
                                  onClick={() => setShowAllTipsModal(false)}
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
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

