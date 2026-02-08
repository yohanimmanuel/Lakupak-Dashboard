'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BadgePercentIcon, ChartBarIcon, ChevronDown, ChevronRight, FileTextIcon, GiftIcon, HandshakeIcon, HomeIcon, ListIcon, MenuIcon, PackageIcon, SettingsIcon, UsersIcon, X, DollarSign, TrendingUp, Activity, GlobeIcon, StoreIcon, MegaphoneIcon, ChartAreaIcon } from 'lucide-react';
import { useMenuContext } from '@/app/(dashboard)/(menulist)/DashboardClientLayout';

const mainMenuItems = [
  { label: 'Home', href: '/home', color: 'text-[#0a61d7]', icon: <HomeIcon className="w-5 h-5" /> },
  {
    label: 'Clients',
    href: '/clients',
    icon: <HandshakeIcon className="w-5 h-5" />,
    submenu: [
      { icon: <ListIcon className="w-5 h-5" />, label: 'Buyers', href: '/clients/buyers' },
      { icon: <ListIcon className="w-5 h-5" />, label: 'Suppliers', href: '/clients/suppliers' },
    ],
  },
  { label: 'Products', href: '/products', icon: <PackageIcon className="w-5 h-5" /> },
  { label: 'Orders', href: '/orders', icon: <FileTextIcon className="w-5 h-5" /> },
  { label: 'Offers', href: '/offers', icon: <GiftIcon className="w-5 h-5" /> },
  {
    label: 'Marketing',
    href: '/marketing',
    icon: <MegaphoneIcon className="w-5 h-5" />,
    submenu: [
      { icon: <ListIcon className="w-5 h-5" />, label: 'Team', href: '/marketing/team' },
      { icon: <ListIcon className="w-5 h-5" />, label: 'Campaigns', href: '/marketing/campaigns' },
      { icon: <ListIcon className="w-5 h-5" />, label: 'Automations', href: '/marketing/automation' },
    ],
  },
  {
    label: 'Analytics',
    href: '/analytics',
    icon: <ChartAreaIcon className="w-5 h-5" />,
    submenu: [
      { icon: <ListIcon className="w-5 h-5" />, label: 'Financial', href: '/analytics/financial' },
      { icon: <ListIcon className="w-5 h-5" />, label: 'Sales', href: '/analytics/sales' },
      { icon: <ListIcon className="w-5 h-5" />, label: 'Operational', href: '/analytics/performance' },
    ],
  },
];

const secondaryMenuItems = [
  {
    label: 'Marketplace',
    icon: <StoreIcon className="w-5 h-5" />,
    href: '/marketplace',
  },
  { label: 'Settings', href: '/settings', icon: <SettingsIcon className="w-5 h-5" /> },
];

const Menu = () => {
  const pathname = usePathname();
  const currentPath = pathname ?? '';
  const { isCollapsed, toggleMenu, isMobileMenuOpen, toggleMobileMenu } = useMenuContext();
  const [openMenus, setOpenMenus] = useState<{ [key: string]: boolean }>({});
  const [hoveredMenu, setHoveredMenu] = useState<string | null>(null);
  const [submenuPosition, setSubmenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const submenuTimeout = useRef<NodeJS.Timeout | null>(null);
  const menuItemRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [showPromo, setShowPromo] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Check if screen is mobile size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Force expanded view on mobile, use desktop state on desktop
  const shouldShowExpanded = isMobile ? true : !isCollapsed;

  const handleToggle = (label: string) => {
    setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  type SubItem = { icon: React.ReactNode; label: string; href: string };
  type MenuItem = { label: string; href?: string; color?: string; icon: React.ReactNode; submenu?: SubItem[] };

  // Helper function to get text color classes
  const getTextColorClasses = (isActive: boolean | undefined) => 
    isActive ? 'text-[#007bff]' : 'text-gray-500 group-hover:text-blue-400';

  // Helper function to render icon with color
  const renderIcon = (icon: React.ReactNode, isActive: boolean | undefined) => (
    <span className={`w-[20px] h-[20px] flex items-center justify-center flex-shrink-0 [&>svg]:text-current ${getTextColorClasses(isActive)}`}>
      {icon}
    </span>
  );

  // Helper function to render line block
  const renderLineBlock = (isActive: boolean | undefined, showHover = false) => {
    if (isActive) {
      return <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#007bff] rounded-r"></div>;
    }
    if (showHover) {
      return <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-200 rounded-r opacity-0 group-hover:opacity-100 transition-opacity duration-100"></div>;
    }
    return null;
  };

  const renderMenuItem = (item: MenuItem) => {
    const isActive: boolean = Boolean(currentPath === item.href || (item.href && currentPath.startsWith(item.href + '/')));
    if (item.submenu) {
      const isOpen = openMenus[item.label];
      const isAnySubActive = item.submenu.some((sub: SubItem) => currentPath === sub.href || (sub.href && currentPath.startsWith(sub.href + '/')));
      // For items with submenus:
      // - Parent is active if: (parent itself is active AND no submenu is active) OR (menu is collapsed AND submenu is active)
      // - When expanded and submenu is active: parent is inactive (gray), only submenu shows as active
      // - When collapsed and submenu is active: parent is active (blue) to represent the active submenu
      const shouldHighlightParent = (isActive && !isAnySubActive) || (!shouldShowExpanded && isAnySubActive);
      // Collapsed: floating submenu on hover
      const handleMouseEnter = () => {
        if (!shouldShowExpanded) {
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
        if (!shouldShowExpanded) {
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
          className="overflow-visible relative"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          ref={el => { if (item.submenu) menuItemRefs.current[item.label] = el; }}
        >
          {/* Continuous line from parent through all submenu items (expanded mode only) - spans full height */}
          {/* Show when: parent is active OR any submenu is active */}
          {shouldShowExpanded && isOpen && (isActive || isAnySubActive) && (
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#007bff] z-0 rounded-r"></div>
          )}
          <div className="flex items-center w-full relative group">
            {renderLineBlock(shouldHighlightParent, !isAnySubActive)}
            {item.href ? (
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-2.5 py-2 rounded-lg font-medium flex-1 text-left transition-colors duration-100 relative ${getTextColorClasses(shouldHighlightParent)}`}
                title={!shouldShowExpanded ? item.label : undefined}
              >
                {renderIcon(item.icon, shouldHighlightParent)}
                {shouldShowExpanded && (
                  <span className={`menu-text whitespace-nowrap font-medium transition-all duration-100 ${getTextColorClasses(shouldHighlightParent)}`}>
                    {item.label}
                  </span>
                )}
              </Link>
            ) : (
              <button
                onClick={() => shouldShowExpanded && handleToggle(item.label)}
                className={`flex items-center gap-3 px-2.5 py-2 rounded-lg font-medium w-full text-left transition-colors duration-100 relative ${getTextColorClasses(shouldHighlightParent)}`}
                title={!shouldShowExpanded ? item.label : undefined}
              >
                {renderIcon(item.icon, shouldHighlightParent)}
                {shouldShowExpanded && (
                  <span className={`menu-text whitespace-nowrap font-medium transition-all duration-100 ${getTextColorClasses(shouldHighlightParent)}`}>
                    {item.label}
                  </span>
                )}
              </button>
            )}
            {shouldShowExpanded && item.submenu && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleToggle(item.label);
                }}
                className="p-1 rounded hover:bg-gray-200 transition-colors"
                aria-label="Toggle submenu"
              >
                {isOpen ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
              </button>
            )}
          </div>
          {/* Tooltip for collapsed state */}
          {!shouldShowExpanded && (
            <div className="absolute left-full ml-3 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-100 whitespace-nowrap z-50 shadow-lg">
              {item.label}
              <div className="absolute top-1/2 -left-1 transform -translate-y-1/2 w-0 h-0 border-r-4 border-r-gray-900 border-t-2 border-t-transparent border-b-2 border-b-transparent"></div>
            </div>
          )}
          {/* Floating Submenu Panel (collapsed mode) */}
          {!shouldShowExpanded && item.submenu && hoveredMenu === item.label && (
            <div
              className="fixed z-50 min-w-[200px] bg-white shadow-xl rounded-lg py-2 border border-gray-100 flex flex-col gap-1"
              style={{ top: submenuPosition.top, left: submenuPosition.left + 4 }}
              onMouseEnter={handleSubmenuEnter}
              onMouseLeave={handleSubmenuLeave}
            >
              {item.submenu.map((sub: SubItem) => {
                const isSubActive = currentPath === sub.href || (sub.href && currentPath.startsWith(sub.href + '/'));
                return (
                  <Link
                    key={sub.label}
                    href={sub.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-[14px] group relative mx-2 ${getTextColorClasses(Boolean(isSubActive))}`}
                  >
                    {renderLineBlock(Boolean(isSubActive), true)}
                    {renderIcon(sub.icon, Boolean(isSubActive))}
                    <span className="font-medium">{sub.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
          {/* Submenu Items (expanded mode) */}
          {item.submenu && shouldShowExpanded && isOpen && (
            <div className="ml-2 mt-1 space-y-1 pl-1 relative">
              {item.submenu.map((sub: SubItem) => {
                const isSubActive = currentPath === sub.href || (sub.href && currentPath.startsWith(sub.href + '/'));
                return (
                  <Link
                    key={sub.label}
                    href={sub.href}
                    className={`flex items-center gap-3 px-2 py-2 rounded-lg transition-all duration-100 text-[14px] group relative mx-2 ${getTextColorClasses(Boolean(isSubActive))}`}
                  >
                    {/* Only show hover line if not active and continuous line is not showing */}
                    {!isSubActive && !isAnySubActive && renderLineBlock(false, true)}
                    {renderIcon(sub.icon, Boolean(isSubActive))}
                    <span className={`whitespace-nowrap font-medium transition-all duration-100 ${getTextColorClasses(Boolean(isSubActive))}`}>
                      {sub.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    }
    return (
      <Link
        key={item.label}
        href={item.href || '#'}
        className={`flex items-center gap-3 px-2.5 py-2 rounded-lg font-medium transition-colors duration-100 relative group ${getTextColorClasses(isActive)} ${item.color || ''}`}
        title={!shouldShowExpanded ? item.label : undefined}
      >
        {renderLineBlock(isActive, true)}
        {renderIcon(item.icon, isActive)}
        {shouldShowExpanded && (
          <span className={`menu-text whitespace-nowrap font-medium transition-all duration-100 ${getTextColorClasses(isActive)}`}>
            {item.label}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="text-sm h-full flex flex-col bg-white relative" data-menu>
      {/* Logo Section */}
      <div className="mb-2">
        {shouldShowExpanded ? (
          <div className="flex items-center justify-between px-4 mt-4 mb-2">
            <Link href="/home" className="flex items-center min-w-0 group">
              <div className="flex items-center min-w-0 group-hover:text-blue-700 transition-colors duration-200">
                <div className="bg-white">
                  <img src="/LakuTextLogo.svg" alt="Laku Logo" className="h-10" />
                </div>
              </div>
            </Link>
            {/* Mobile Close Button */}
            <button
              onClick={toggleMobileMenu}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-3 mt-4 -mb-2">
            <Link href="/home" className="flex items-center justify-center group">
              <div className="bg-white">
                <img src="/LakuIcon.svg" alt="Laku Logo" className="h-10 w-10" />
              </div>
            </Link>
            {/* Mobile Close Button for collapsed view */}
            <button
              onClick={toggleMobileMenu}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
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
      {showPromo && shouldShowExpanded && (
        <div className="absolute left-0 right-0 bottom-4 flex justify-center z-20">
          <div className="relative w-[90%] bg-gradient-to-r from-[#0a61d7] to-blue-500 rounded-2xl p-4 flex flex-col items-start shadow-xl">
            <button
              className="absolute top-2 right-2 text-white hover:text-gray-300 p-1 rounded"
              onClick={() => setShowPromo(false)}
              aria-label="Close promo"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-white text-md font-semibold mb-1 w-38">Loving Laku Free?</div>
            <div className="text-gray-200 text-xs mb-4">Go <span className="text-teal-300">Premium</span> to access priority support, real-time tracking, and full analytics.</div>
            <button className="w-full bg-white text-[#0a61d7] font-bold p-2 rounded-lg shadow hover:bg-gray-200 transition text-sm">Go Premium Today</button>
          </div>
        </div>
      )}
      {/* Promo Mini Overlay for Collapsed */}
      {showPromo && !shouldShowExpanded && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-20 flex flex-col items-center group">
          <div
            className="w-12 h-12 bg-gradient-to-r from-[#0a61d7] to-blue-500 rounded-xl flex items-center justify-center shadow-xl cursor-pointer relative"
            onClick={() => { if (!shouldShowExpanded) toggleMenu(); }}
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
