'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BadgePercentIcon, ChartBarIcon, ChevronDown, ChevronRight, FileTextIcon, GiftIcon, HandshakeIcon, HomeIcon, ListIcon, MenuIcon, PackageIcon, SettingsIcon, UsersIcon, X } from 'lucide-react';
import { useMenuContext } from '@/app/(dashboard)/(menulist)/DashboardClientLayout';

const mainMenuItems = [
  { label: 'Home', href: '/home', color: 'text-[#0a61d7]', icon: <HomeIcon className="w-5 h-5" /> },
  {
    label: 'Clients',
    icon: <HandshakeIcon className="w-5 h-5" />,
    submenu: [
      { icon: <ListIcon className="w-5 h-5" />, label: 'Buyers', href: '/clients/buyers' },
      { icon: <ListIcon className="w-5 h-5" />, label: 'Suppliers', href: '/clients/suppliers' },
    ],
  },
  { label: 'Products', href: '/products', icon: <PackageIcon className="w-5 h-5" /> },
  { label: 'Orders', href: '/orders', icon: <FileTextIcon className="w-5 h-5" /> },
  { label: 'Analytics', href: '/analytics', icon: <ChartBarIcon className="w-5 h-5" /> },
  {
    label: 'Programs',
    icon: <GiftIcon className="w-5 h-5" />,
    submenu: [
      { icon: <ListIcon className="w-5 h-5" />, label: 'Discounts', href: '/programs/discounts' },
      { icon: <ListIcon className="w-5 h-5" />, label: 'Promotions', href: '/programs/promotions' },
    ],
  },
];

const secondaryMenuItems = [
  {
    label: 'Sales',
    icon: <BadgePercentIcon className="w-5 h-5" />,
    submenu: [
      { icon: <ListIcon className="w-5 h-5" />, label: 'Analytics', href: '/sales/analytics' },
      { icon: <ListIcon className="w-5 h-5" />, label: 'Campaigns', href: '/sales/campaigns' },
      { icon: <ListIcon className="w-5 h-5" />, label: 'Catalogs', href: '/sales/catalogs' },
      { icon: <ListIcon className="w-5 h-5" />, label: 'Lead Management', href: '/sales/leadmanagement' },
    ],
  },
  {
    label: 'Leads',
    icon: <UsersIcon className="w-5 h-5" />,
    submenu: [
      { icon: <ListIcon className="w-5 h-5" />, label: 'Buyer Leads', href: '/leads/buyerleads' },
      { icon: <ListIcon className="w-5 h-5" />, label: 'Supplier Leads', href: '/leads/supplierleads' },
    ],
  },
  { label: 'Settings', href: '/settings', icon: <SettingsIcon className="w-5 h-5" /> },
];

const Menu = () => {
  const pathname = usePathname();
  const { isCollapsed, toggleMenu } = useMenuContext();
  const [openMenus, setOpenMenus] = useState<{ [key: string]: boolean }>({});
  const [hoveredMenu, setHoveredMenu] = useState<string | null>(null);
  const [submenuPosition, setSubmenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const submenuTimeout = useRef<NodeJS.Timeout | null>(null);
  const menuItemRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [showPromo, setShowPromo] = useState(true);

  const handleToggle = (label: string) => {
    setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  type SubItem = { icon: React.ReactNode; label: string; href: string };
  type MenuItem = { label: string; href?: string; color?: string; icon: React.ReactNode; submenu?: SubItem[] };

  const renderMenuItem = (item: MenuItem) => {
    const isActive = pathname === item.href || (item.href && pathname.startsWith(item.href));
    if (item.submenu) {
      const isOpen = openMenus[item.label];
      const isAnySubActive = item.submenu.some((sub: SubItem) => pathname.startsWith(sub.href));
      // Collapsed: floating submenu on hover
      const handleMouseEnter = () => {
        if (isCollapsed) {
          if (submenuTimeout.current) clearTimeout(submenuTimeout.current);
          setHoveredMenu(item.label);
          const ref = menuItemRefs.current[item.label];
          if (ref) {
            const rect = ref.getBoundingClientRect();
            setSubmenuPosition({ top: rect.top, left: rect.right });
          }
        }
      };
      const handleMouseLeave = () => {
        if (isCollapsed) {
          submenuTimeout.current = setTimeout(() => {
            setHoveredMenu(null);
          }, 150);
        }
      };
      const handleSubmenuEnter = () => {
        if (submenuTimeout.current) clearTimeout(submenuTimeout.current);
      };
      const handleSubmenuLeave = () => {
        submenuTimeout.current = setTimeout(() => {
          setHoveredMenu(null);
        }, 150);
      };
      return (
        <div
          key={item.label}
          className="overflow-hidden relative"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          ref={el => { if (item.submenu) menuItemRefs.current[item.label] = el; }}
        >
          <button
            onClick={() => !isCollapsed && handleToggle(item.label)}
            className={`flex items-center gap-3 px-2.5 py-2 rounded-lg font-medium w-full text-left transition-colors duration-100 group relative ${
              isAnySubActive ? 'bg-blue-100 text-[#007bff] shadow-sm' : 'text-gray-500 hover:bg-gray-200 hover:text-gray-800'
            }`}
            title={isCollapsed ? item.label : undefined}
          >
            <span className="w-[20px] h-[20px] flex items-center justify-center flex-shrink-0">{item.icon}</span>
            {!isCollapsed && <span className="menu-text whitespace-nowrap font-medium transition-all duration-100">{item.label}</span>}
            {!isCollapsed && (
              <span className="ml-auto">
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            )}
          </button>
          {/* Tooltip for collapsed state */}
          {isCollapsed && (
            <div className="absolute left-full ml-3 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-100 whitespace-nowrap z-50 shadow-lg">
              {item.label}
              <div className="absolute top-1/2 -left-1 transform -translate-y-1/2 w-0 h-0 border-r-4 border-r-gray-900 border-t-2 border-t-transparent border-b-2 border-b-transparent"></div>
            </div>
          )}
          {/* Floating Submenu Panel (collapsed mode) */}
          {isCollapsed && item.submenu && hoveredMenu === item.label && (
            <div
              className="fixed z-50 min-w-[200px] bg-white shadow-xl rounded-lg py-2 border border-gray-100 flex flex-col gap-1"
              style={{ top: submenuPosition.top, left: submenuPosition.left + 4 }}
              onMouseEnter={handleSubmenuEnter}
              onMouseLeave={handleSubmenuLeave}
            >
              {item.submenu.map((sub: SubItem) => (
                <Link
                  key={sub.label}
                  href={sub.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-[14px] group relative mx-2 ${
                    pathname === sub.href || pathname.startsWith(sub.href)
                      ? 'bg-blue-200 text-[#007bff] shadow-sm'
                      : 'text-gray-500 hover:bg-blue-100 hover:text-[#007bff]'
                  }`}
                >
                  <span className="w-[20px] h-[20px] flex items-center justify-center flex-shrink-0">{sub.icon}</span>
                  <span className="font-medium">{sub.label}</span>
                </Link>
              ))}
            </div>
          )}
          {/* Submenu Items (expanded mode) */}
          {item.submenu && !isCollapsed && isOpen && (
            <div className="ml-2 mt-1 space-y-1 pl-1">
              {item.submenu.map((sub: SubItem) => (
                <Link
                  key={sub.label}
                  href={sub.href}
                  className={`flex items-center gap-3 px-2 py-2 rounded-lg transition-all duration-100 text-[14px] group relative mx-2 ${
                    pathname === sub.href || pathname.startsWith(sub.href)
                      ? 'bg-blue-200 text-[#007bff] shadow-sm'
                      : 'text-gray-500 hover:bg-gray-200 hover:text-gray-800'
                  }`}
                >
                  <span className="w-[20px] h-[20px] flex items-center justify-center flex-shrink-0">{sub.icon}</span>
                  <span className="whitespace-nowrap font-medium transition-all duration-100">
                    {sub.label}
                  </span>
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
        href={item.href || '#'}
        className={`flex items-center gap-3 px-2.5 py-2 rounded-lg font-medium transition-colors duration-100 ${
          isActive ? 'bg-blue-100 text-[#007bff] shadow-sm' : 'text-gray-500 hover:bg-gray-200 hover:text-gray-800'
        } ${item.color || ''}`}
        title={isCollapsed ? item.label : undefined}
      >
        <span className="w-[20px] h-[20px] flex items-center justify-center flex-shrink-0">{item.icon}</span>
        {!isCollapsed && <span className="menu-text whitespace-nowrap font-medium transition-all duration-100">{item.label}</span>}
      </Link>
    );
  };

  return (
    <div className="text-sm h-full flex flex-col bg-white relative" data-menu>
      {/* Logo Section */}
      <div className={`${isCollapsed ? 'mb-2' : 'mb-2'}`}>
        {!isCollapsed ? (
          <div className="flex items-center justify-between px-4 mt-4 mb-2">
            <Link href="/home" className="flex items-center min-w-0 group">
              <div className="flex items-center min-w-0 group-hover:text-blue-700 transition-colors duration-200">
                <div className="bg-white">
                  <img src="/LakuLakuTextLogo.svg" alt="Laku-Laku Logo" className="h-10" />
                </div>
              </div>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-3 mt-4 mb-2">
            <Link href="/home" className="flex items-center justify-center group">
              <div className="bg-white">
                <img src="/LakuLakuIcon.svg" alt="Laku-Laku Logo" className="h-10 w-10" />
              </div>
            </Link>
          </div>
        )}
        {/* Inset divider below logo/header */}
        <div className="border-t border-gray-200 mt-1 ml-4 mr-4" />
      </div>
      {/* Menu Items */}
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        <nav className="flex flex-col gap-1 mb-4 px-3.5 text-[14px]">
          {mainMenuItems.map(renderMenuItem)}
          <div className="border-t border-gray-200 my-2" />
          {secondaryMenuItems.map(renderMenuItem)}
        </nav>
      </div>
      {/* Promo Overlay */}
      {showPromo && !isCollapsed && (
        <div className="absolute left-0 right-0 bottom-4 flex justify-center z-20">
          <div className="relative w-[90%] bg-gradient-to-r from-[#0a61d7] to-blue-500 rounded-2xl p-4 flex flex-col items-start shadow-xl">
            <button
              className="absolute top-2 right-2 text-white hover:text-gray-300 p-1 rounded"
              onClick={() => setShowPromo(false)}
              aria-label="Close promo"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-white text-md font-semibold mb-1 w-38">Loving Laku-Laku Free?</div>
            <div className="text-gray-200 text-xs mb-4">Go <span className="text-teal-300">Premium</span> to access priority support, real-time tracking, and full analytics.</div>
            <button className="w-full bg-white text-[#0a61d7] font-bold p-2 rounded-lg shadow hover:bg-gray-200 transition text-sm">Go Premium Today</button>
          </div>
        </div>
      )}
      {/* Promo Mini Overlay for Collapsed */}
      {showPromo && isCollapsed && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-20 flex flex-col items-center group">
          <div
            className="w-12 h-12 bg-gradient-to-r from-[#0a61d7] to-blue-500 rounded-xl flex items-center justify-center shadow-xl cursor-pointer relative"
            onClick={() => { if (isCollapsed) toggleMenu(); }}
          >
            <span className="text-2xl">🤗</span>
            <span className="absolute left-[110%] top-1/2 -translate-y-1/2 ml-2 px-4 py-2 rounded-lg bg-blue-500 text-white font-semibold text-xs opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-30">Upgrade to <span className="text-teal-300">Premium</span> for more features!</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Menu;
