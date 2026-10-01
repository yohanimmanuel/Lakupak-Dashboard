'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BadgePercentIcon, ChartBarIcon, ChevronDown, FileTextIcon, GiftIcon, HandshakeIcon, HomeIcon, ListIcon, PackageIcon, SettingsIcon, UsersIcon, X, DollarSign, TrendingUp, Activity, GlobeIcon, StoreIcon, BadgeDollarSign, ChartAreaIcon, CircleHelp, PanelLeftClose, PanelLeft, NetworkIcon } from 'lucide-react';
import { useMenuContext } from '@/app/(dashboard)/(menulist)/DashboardClientLayout';
import { DashboardHelpModal } from '@/components/dashboard/DashboardHelpModal';
import { PromoSidePanel } from '@/components/dashboard/PromoSidePanel';
import { useDashboardTourOptional } from '@/components/tours/TourProvider';
import { DASHBOARD_TOURS, shellIntroSessionStorageKey } from '@/components/tours/tourIds';
import { useUserStore } from '@/store/userStore';

const NAV_LABEL_KEYS: Record<string, string> = {
  Home: 'home',
  Clients: 'clients',
  Buyers: 'buyers',
  Suppliers: 'suppliers',
  Products: 'products',
  Orders: 'orders',
  Offers: 'offers',
  Team: 'team',
  Jobs: 'jobs',
  Automation: 'automation',
  Analytics: 'analytics',
  Financial: 'financial',
  Sales: 'sales',
  Operational: 'operational',
  Marketplace: 'marketplace',
  Logistics: 'logistics',
  Settings: 'settings',
};

/** Stable anchors for dashboard product tours (`driver.js`). */
const DATA_TOUR_BY_LABEL: Record<string, string> = {
  Home: 'nav-home',
  Clients: 'nav-clients',
  Products: 'nav-products',
  Orders: 'nav-orders',
  Offers: 'nav-offers',
  Sales: 'nav-sales',
  Analytics: 'nav-analytics',
  Automation: 'nav-automation',
  Marketplace: 'nav-marketplace',
  Logistics: 'nav-logistics',
  Settings: 'nav-settings',
};

const mainMenuItems = [
  { label: 'Home', href: '/home', icon: <HomeIcon className="w-5 h-5" /> },
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
    label: 'Sales',
    href: '/sales',
    icon: <BadgeDollarSign className="w-5 h-5" />,
    submenu: [
      { icon: <ListIcon className="w-5 h-5" />, label: 'Team', href: '/sales/team' },
      { icon: <ListIcon className="w-5 h-5" />, label: 'Jobs', href: '/sales/jobs' },
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
    label: 'Automation',
    icon: <NetworkIcon className="w-5 h-5" />,
    href: '/automation',
  },
  {
    label: 'Marketplace',
    icon: <StoreIcon className="w-5 h-5" />,
    href: '/marketplace',
  },
  { label: 'Settings', href: '/settings', icon: <SettingsIcon className="w-5 h-5" /> },
];

const LAKU_PRIMARY_TEXT = 'text-[#0a61d7]';
const LAKU_PRIMARY_BG = 'bg-[#e8f0fe]';

/** Once per full page load — survives client-side route changes, resets on reload. */
let promoScheduleStarted = false;
let promoDismissedThisPageLoad = false;

const Menu = () => {
  const pathname = usePathname();
  const currentPath = pathname ?? '';
  const { isCollapsed, toggleMenu, isMobileMenuOpen, toggleMobileMenu } = useMenuContext();
  const tour = useDashboardTourOptional();
  const userId = useUserStore((s) => s.user?.id);
  const tNav = useTranslations('dashboard.nav');
  const tSidebar = useTranslations('dashboard.sidebar');
  const navLabel = (label: string) => {
    const key = NAV_LABEL_KEYS[label];
    return key ? tNav(key) : label;
  };
  const [openMenus, setOpenMenus] = useState<{ [key: string]: boolean }>({});
  const [hoveredMenu, setHoveredMenu] = useState<string | null>(null);
  const [submenuPosition, setSubmenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const submenuTimeout = useRef<NodeJS.Timeout | null>(null);
  const menuItemRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [showPromo, setShowPromo] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
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

  // Show promo once per dashboard reload (not on client-side menu navigation)
  useEffect(() => {
    if (promoScheduleStarted || promoDismissedThisPageLoad) return;
    if (tour && !tour.tourProgressReady) return;

    promoScheduleStarted = true;

    const canShowPromo = () => {
      if (promoDismissedThisPageLoad) return false;
      if (userId == null || !Number.isFinite(userId) || userId <= 0) return true;
      const sessionKey = shellIntroSessionStorageKey(userId);
      if (sessionStorage.getItem(sessionKey)) return true;
      if (!tour) return true;
      return tour.getStatus(DASHBOARD_TOURS.shell.id, DASHBOARD_TOURS.shell.version) !== 'none';
    };

    const reveal = () => {
      if (!promoDismissedThisPageLoad) setShowPromo(true);
    };

    if (canShowPromo()) {
      const timer = window.setTimeout(reveal, 800);
      return () => window.clearTimeout(timer);
    }

    const interval = window.setInterval(() => {
      if (canShowPromo()) {
        window.clearInterval(interval);
        reveal();
      }
    }, 500);

    const fallback = window.setTimeout(() => {
      window.clearInterval(interval);
      reveal();
    }, 20000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(fallback);
    };
  }, [tour, tour?.tourProgressReady, userId]);

  // Auto-expand submenus when the current route matches a submenu item
  useEffect(() => {
    const autoOpen: { [key: string]: boolean } = {};
    for (const item of mainMenuItems) {
      if (item.submenu?.some((sub) => currentPath === sub.href || currentPath.startsWith(sub.href + '/'))) {
        autoOpen[item.label] = true;
      }
    }
    if (Object.keys(autoOpen).length > 0) {
      setOpenMenus((prev) => ({ ...prev, ...autoOpen }));
    }
  }, [currentPath]);

  // Mobile always shows the full menu; desktop follows collapse state.
  // Icons stay in a fixed position and only the labels fade + clip, so the
  // width animation stays smooth in both directions (no layout swap = no twitch).
  const shouldShowExpanded = isMobile ? true : !isCollapsed;
  const isIconOnly = !isMobile && isCollapsed;

  const handleToggle = (label: string) => {
    setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  type SubItem = { icon: React.ReactNode; label: string; href: string };
  type MenuItem = {
    label: string;
    href?: string;
    color?: string;
    icon: React.ReactNode;
    submenu?: SubItem[];
    activePaths?: string[];
  };

  const getTextColorClasses = (isActive: boolean | undefined) =>
    isActive ? LAKU_PRIMARY_TEXT : 'text-gray-600 group-hover:text-[#0a61d7]';

  const getFontWeightClasses = (isActive: boolean | undefined) =>
    isActive ? 'font-bold' : 'font-medium';

  const getActiveBgClasses = (isActive: boolean | undefined) =>
    isActive ? LAKU_PRIMARY_BG : 'hover:bg-gray-100';

  const renderIcon = (icon: React.ReactNode, isActive: boolean | undefined) => (
    <span className={`w-[20px] h-[20px] flex items-center justify-center flex-shrink-0 [&>svg]:text-current ${getTextColorClasses(isActive)}`}>
      {icon}
    </span>
  );

  const renderMenuItem = (item: MenuItem) => {
    const matchesPath = (path: string | undefined) =>
      Boolean(path && (currentPath === path || currentPath.startsWith(path + '/')));
    const isActive: boolean = Boolean(
      matchesPath(item.href) || item.activePaths?.some((path) => matchesPath(path)),
    );
    if (item.submenu) {
      const isOpen = openMenus[item.label];
      const isAnySubActive = item.submenu.some((sub: SubItem) => currentPath === sub.href || (sub.href && currentPath.startsWith(sub.href + '/')));
      const isParentActive = isActive || isAnySubActive;
      const shouldHighlightParent = isParentActive;
      // Collapsed: floating submenu on hover
      const handleMouseEnter = () => {
        if (isIconOnly) {
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
        if (isIconOnly) {
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
          className={`relative ${shouldShowExpanded ? 'overflow-visible' : 'overflow-hidden'}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          ref={el => { if (item.submenu) menuItemRefs.current[item.label] = el; }}
        >
          <div className="relative">
            {item.href ? (
              <Link
                href={item.href}
                data-tour={DATA_TOUR_BY_LABEL[item.label]}
                className={`flex w-full min-w-0 items-center gap-3 py-2 pl-2.5 rounded-lg transition-colors duration-150 ${shouldShowExpanded ? 'pr-9' : 'pr-2.5'} ${getTextColorClasses(shouldHighlightParent)} ${getFontWeightClasses(shouldHighlightParent)} ${isActive && !isAnySubActive ? LAKU_PRIMARY_BG : 'hover:bg-gray-100'}`}
                title={isIconOnly ? navLabel(item.label) : undefined}
              >
                {renderIcon(item.icon, shouldHighlightParent)}
                <span className={`menu-text whitespace-nowrap transition-opacity duration-200 ${shouldShowExpanded ? 'opacity-100' : 'opacity-0'} ${getTextColorClasses(shouldHighlightParent)} ${getFontWeightClasses(shouldHighlightParent)}`}>
                  {navLabel(item.label)}
                </span>
              </Link>
            ) : (
              <button
                data-tour={DATA_TOUR_BY_LABEL[item.label]}
                onClick={() => shouldShowExpanded && handleToggle(item.label)}
                className={`flex w-full min-w-0 items-center gap-3 py-2 pl-2.5 rounded-lg text-left transition-colors duration-150 ${shouldShowExpanded ? 'pr-9' : 'pr-2.5'} ${getTextColorClasses(shouldHighlightParent)} ${getFontWeightClasses(shouldHighlightParent)} ${isActive && !isAnySubActive ? LAKU_PRIMARY_BG : 'hover:bg-gray-100'}`}
                title={isIconOnly ? navLabel(item.label) : undefined}
              >
                {renderIcon(item.icon, shouldHighlightParent)}
                <span className={`menu-text whitespace-nowrap transition-opacity duration-200 ${shouldShowExpanded ? 'opacity-100' : 'opacity-0'} ${getTextColorClasses(shouldHighlightParent)} ${getFontWeightClasses(shouldHighlightParent)}`}>
                  {navLabel(item.label)}
                </span>
              </button>
            )}
            {item.submenu && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleToggle(item.label);
                }}
                className={`absolute right-1.5 top-1/2 z-10 -translate-y-1/2 rounded-md p-1 transition-all duration-200 hover:bg-gray-200 ${shouldShowExpanded ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
                aria-label={tNav('toggleSubmenu')}
              >
                <ChevronDown
                  size={14}
                  className={`text-gray-500 transition-transform duration-300 ease-in-out ${isOpen ? 'rotate-0' : '-rotate-90'}`}
                />
              </button>
            )}
          </div>
          {/* Floating Submenu Panel (collapsed mode) */}
          {isIconOnly && item.submenu && hoveredMenu === item.label && (
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
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-[14px] group relative mx-2 transition-all duration-200 ${getTextColorClasses(Boolean(isSubActive))} ${getFontWeightClasses(Boolean(isSubActive))} ${getActiveBgClasses(Boolean(isSubActive))}`}
                  >
                    {renderIcon(sub.icon, Boolean(isSubActive))}
                    <span>{navLabel(sub.label)}</span>
                  </Link>
                );
              })}
            </div>
          )}
          {/* Submenu Items (expanded mode) — animated open/close */}
          {item.submenu && shouldShowExpanded && (
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
            >
              <div className="overflow-hidden">
                <div className={`ml-2 mt-1 space-y-1 pl-1 relative transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
                  {item.submenu.map((sub: SubItem) => {
                    const isSubActive = currentPath === sub.href || (sub.href && currentPath.startsWith(sub.href + '/'));
                    return (
                      <Link
                        key={sub.label}
                        href={sub.href}
                        className={`flex items-center gap-3 px-2 py-2 rounded-lg transition-all duration-200 text-[14px] group relative mx-2 ${getTextColorClasses(Boolean(isSubActive))} ${getFontWeightClasses(Boolean(isSubActive))} ${getActiveBgClasses(Boolean(isSubActive))}`}
                      >
                        {renderIcon(sub.icon, Boolean(isSubActive))}
                        <span className={`whitespace-nowrap transition-all duration-200 ${getTextColorClasses(Boolean(isSubActive))} ${getFontWeightClasses(Boolean(isSubActive))}`}>
                          {navLabel(sub.label)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }
    return (
      <Link
        key={item.label}
        href={item.href || '#'}
        data-tour={DATA_TOUR_BY_LABEL[item.label]}
        className={`group flex w-full min-w-0 items-center gap-3 px-2.5 py-2 rounded-lg transition-colors duration-150 relative ${getTextColorClasses(isActive)} ${getFontWeightClasses(isActive)} ${getActiveBgClasses(isActive)}`}
        title={isIconOnly ? navLabel(item.label) : undefined}
      >
        {renderIcon(item.icon, isActive)}
        <span className={`menu-text whitespace-nowrap transition-opacity duration-200 ${shouldShowExpanded ? 'opacity-100' : 'opacity-0'} ${getTextColorClasses(isActive)} ${getFontWeightClasses(isActive)}`}>
          {navLabel(item.label)}
        </span>
      </Link>
    );
  };

  return (
    <div className="text-sm h-full flex flex-col bg-white relative overflow-x-hidden min-w-0" data-menu data-tour="nav-sidebar">
      {/* Mobile close row */}
      {isMobile && (
        <div className="flex items-center justify-end px-3 py-2 border-b border-gray-200 md:hidden">
          <button
            onClick={toggleMobileMenu}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label={tNav('closeMenu')}
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      )}
      {/* Menu Items */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
        <nav className="flex flex-col gap-1 py-3 px-2 text-[14px]">
          {mainMenuItems.map(renderMenuItem)}
          <div className="border-t border-gray-200 my-2" />
          {secondaryMenuItems.map(renderMenuItem)}
        </nav>
      </div>
      {/* Bottom bar: help + collapse */}
      <div className={`shrink-0 border-t border-gray-200 flex px-2 py-2.5 ${shouldShowExpanded ? 'items-center justify-between' : 'flex-col gap-1'}`}>
        <button
          type="button"
          onClick={() => setShowHelp(true)}
          className={`flex items-center rounded-lg py-2 px-2.5 text-gray-600 hover:bg-gray-100 hover:text-[#0a61d7] transition-colors ${shouldShowExpanded ? '' : 'w-full'}`}
          aria-label={tSidebar('help')}
          title={tSidebar('help')}
        >
          <span className="flex h-5 w-5 items-center justify-center">
            <CircleHelp size={18} />
          </span>
        </button>
        {!isMobile && (
          <button
            type="button"
            onClick={toggleMenu}
            className={`flex items-center rounded-lg py-2 px-2.5 text-gray-600 hover:bg-gray-100 hover:text-[#0a61d7] transition-colors ${shouldShowExpanded ? '' : 'w-full'}`}
            aria-label={isCollapsed ? tSidebar('expand') : tSidebar('collapse')}
            title={isCollapsed ? tSidebar('expand') : tSidebar('collapse')}
          >
            <span className="flex h-5 w-5 items-center justify-center">
              {isCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
            </span>
          </button>
        )}
      </div>
      <DashboardHelpModal open={showHelp} onCloseAction={() => setShowHelp(false)} />
      <PromoSidePanel
        show={showPromo}
        onCloseAction={() => {
          promoDismissedThisPageLoad = true;
          setShowPromo(false);
        }}
      />
    </div>
  );
};

export default Menu;
