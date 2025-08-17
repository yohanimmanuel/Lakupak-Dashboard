'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BadgePercentIcon, ChartBarIcon, ChevronDown, ChevronRight, FileTextIcon, GiftIcon, HandshakeIcon, HomeIcon, PackageIcon, SettingsIcon, UsersIcon } from 'lucide-react';

const mainMenuItems = [
  { label: 'Home', href: '/home', color: 'text-[#0a61d7]', icon: <HomeIcon className="w-5 h-5" /> },
  {
    label: 'Clients',
    icon: <HandshakeIcon className="w-5 h-5" />,
    submenu: [
      { label: 'Buyers', href: '/clients/buyers' },
      { label: 'Suppliers', href: '/clients/suppliers' },
    ],
  },
  { label: 'Products', href: '/products', icon: <PackageIcon className="w-5 h-5" /> },
  { label: 'Orders', href: '/orders', icon: <FileTextIcon className="w-5 h-5" /> },
  {
    label: 'Programs',
    icon: <GiftIcon className="w-5 h-5" />,
    submenu: [
      { label: 'Discounts', href: '/programs/discounts' },
      { label: 'Promotions', href: '/programs/promotions' },
    ],
  },
  { label: 'Analytics', href: '/analytics', icon: <ChartBarIcon className="w-5 h-5" /> },
  { label: 'Settings', href: '/settings', icon: <SettingsIcon className="w-5 h-5" /> },
];

const secondaryMenuItems = [
  {
    label: 'Leads',
    icon: <UsersIcon className="w-5 h-5" />,
    submenu: [
      { label: 'Buyer Leads', href: '/leads/buyerleads' },
      { label: 'Supplier Leads', href: '/leads/supplierleads' },
    ],
  },
  {
    label: 'Sales',
    icon: <BadgePercentIcon className="w-5 h-5" />,
    submenu: [
      { label: 'Analytics', href: '/sales/analytics' },
      { label: 'Campaigns', href: '/sales/campaigns' },
      { label: 'Catalogs', href: '/sales/catalogs' },
      { label: 'Lead Management', href: '/sales/leadmanagement' },
    ],
  },
];

const Menu = () => {
  const pathname = usePathname();
  const [openMenus, setOpenMenus] = useState<{ [key: string]: boolean }>({});

  const handleToggle = (label: string) => {
    setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const renderMenuItem = (item: any) => {
    const isActive = pathname === item.href;
    if (item.submenu) {
      const isOpen = openMenus[item.label];
      // Check if any submenu is active
      const isAnySubActive = item.submenu.some((sub: any) => pathname.startsWith(sub.href));
      return (
        <div key={item.label}>
          <button
            onClick={() => handleToggle(item.label)}
            className={`flex items-center gap-3 px-4 py-2 rounded-lg font-medium w-full transition-colors duration-100 text-left ${
              isAnySubActive ? 'bg-[#e6f0fd] text-[#0a61d7]' : 'text-gray-700 hover:bg-[#e6e6e6]'
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span>{item.label}</span>
            <span className="ml-auto">{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
          </button>
          {isOpen && (
            <div className="ml-8 flex flex-col gap-1 mt-1">
              {item.submenu.map((sub: any) => (
                <Link
                  key={sub.label}
                  href={sub.href}
                  className={`flex items-center gap-2 px-6 py-1.5 rounded-lg font-medium transition-colors duration-100 text-sm ${
                    pathname === sub.href ? 'bg-[#e6f0fd] text-[#0a61d7]' : 'text-gray-600 hover:bg-[#e6e6e6]'
                  }`}
                >
                  <span>{sub.label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      );
    }
    return (
      <Link
        key={item.label}
        href={item.href}
        className={`flex items-center gap-3 px-4 py-2 rounded-lg font-medium transition-colors duration-100 ${
          isActive ? 'bg-[#e6f0fd] text-[#0a61d7]' : 'text-gray-700 hover:bg-[#e6e6e6]'
        } ${item.color || ''}`}
      >
        <span className="text-xl">{item.icon}</span>
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-white border-r border-gray-200 flex flex-col z-30 select-none">
      <div className="flex items-center justify-center h-15 border-b border-gray-100">
        <a href="/home"><img src="/LakuLakuTextLogo.svg" alt="Laku-Laku Logo" className="h-10" /></a>
      </div>
      <nav className="flex-1 flex flex-col gap-1 mt-4 px-2 text-sm">
        {/* Main menu */}
        {mainMenuItems.map(renderMenuItem)}
        {/* Divider */}
        <div className="border-t border-gray-200 my-3" />
        {/* Secondary menu */}
        {secondaryMenuItems.map(renderMenuItem)}
      </nav>
      <div className="p-4 mt-auto">
        <div className="flex items-center gap-2 bg-[#e6e6e6] rounded-lg px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-[#3ea73b] inline-block"></span>
          <span className="text-xs text-gray-700">All systems normal</span>
        </div>
      </div>
    </aside>
  );
};

export default Menu;
