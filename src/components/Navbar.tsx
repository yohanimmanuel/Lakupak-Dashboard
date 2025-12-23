'use client';

import Image from "next/image";
import { Search, MessageCircle, Bell, User, LogOut, Plus } from 'lucide-react';
import { Menu as MenuIcon } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useUserStore } from '@/store/userStore';
import ReactDOM from 'react-dom';
import { useMenuContext } from '@/app/(dashboard)/(menulist)/DashboardClientLayout';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { fetchGraphQL } from '@/lib/graphqlClient';

const DROPDOWN_WIDTH = 300;

interface SalesAgent {
  id: string;
  name: string;
  avatar?: string | null;
}

type DropdownPortalProps = { anchorRef: React.RefObject<HTMLElement | null>; show: boolean; children: React.ReactNode };
const DropdownPortal = ({ anchorRef, show, children }: DropdownPortalProps) => {
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  useEffect(() => {
    if (show && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 8,
        left: rect.right - DROPDOWN_WIDTH,
      });
    }
  }, [show, anchorRef]);
  if (!show) return null;
  return ReactDOM.createPortal(
    <div 
      data-dropdown-portal
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: DROPDOWN_WIDTH, zIndex: 50 }} 
      className="border border-gray-200 bg-white rounded-xl shadow-2xl py-0 px-0 mt-1"
    >
      {children}
    </div>,
    document.body
  );
};

const SALES_AGENTS_QUERY = `
  query GetSalesAgents($userId: Int!, $page: Int, $limit: Int) {
    salesAgents(userId: $userId, page: $page, limit: $limit) {
      nodes {
        id
        name
        avatar
      }
    }
  }
`;

const Navbar = () => {
  const user = useUserStore(state => state.user);
  const clearUser = useUserStore(state => state.clearUser);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showMsgDropdown, setShowMsgDropdown] = useState(false);
  const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const { toggleMenu, isMobileMenuOpen, toggleMobileMenu } = useMenuContext();
  const [hasMounted, setHasMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Fetch sales agents for navbar
  useEffect(() => {
    const fetchSalesAgents = async () => {
      if (!user?.id) return;
      try {
        const data = await fetchGraphQL<{
          salesAgents: {
            nodes: SalesAgent[];
          };
        }>(SALES_AGENTS_QUERY, {
          userId: user.id,
          page: 1,
          limit: 4, // Only fetch first 4 for navbar display
        });
        setSalesAgents(data.salesAgents.nodes);
      } catch (error) {
        console.error('Error fetching sales agents:', error);
        // Keep empty array on error
        setSalesAgents([]);
      }
    };
    fetchSalesAgents();
  }, [user?.id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Check if click is outside user dropdown (including portal content)
      if (showDropdown) {
        const isClickOnAvatar = dropdownRef.current && dropdownRef.current.contains(target);
        const isClickOnPortal = (target as Element).closest('[data-dropdown-portal]');
        if (!isClickOnAvatar && !isClickOnPortal) {
          setShowDropdown(false);
        }
      }
      
      // Check other dropdowns
      if (notifRef.current && !notifRef.current.contains(target)) {
        setShowNotifDropdown(false);
      }
      if (msgRef.current && !msgRef.current.contains(target)) {
        setShowMsgDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  const handleSignOut = async () => {
    // Clear NextAuth session first
    await signOut({ redirect: false });
    // Then clear user store
    clearUser();
    router.push('/login');
  };

  const handleAddSalesman = () => {
    router.push('/marketing/team/create');
  };

  const handleSalesmanClick = (agentId: string) => {
    router.push(`/marketing/team/details?id=${agentId}`);
  };

  const handleSalesTeamClick = () => {
    router.push('/marketing/team');
  };

  const formatRole = (role: string) => {
    if (!role) return '';
    return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
  };

  if (!hasMounted) return null;

  const maxAvatars = 3;
  const extraCount = salesAgents.length - maxAvatars;

  return (
    <div className="flex items-center justify-between px-4 py-3 z-30 relative bg-white border-b border-gray-200 h-16">
      {/* MENU COLLAPSE BUTTON */}
      <button
        className="mr-4 p-2 rounded-lg hover:bg-gray-200 transition-all duration-100 flex-shrink-0 group"
        aria-label="Toggle menu"
        onClick={toggleMenu}
      >
        <MenuIcon size={20} className="text-gray-700 transition-colors duration-100" />
      </button>
      {/* SEARCH BAR - Hidden on Mobile */}
      <div className="hidden sm:flex flex-1 items-left justify-left">
        <div className="relative w-[300px] max-w-full">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Search size={15} />
          </span>
          <input
            type="text"
            placeholder="Quick Search..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0a61d7] text-xs text-black"
          />
        </div>
      </div>
      {/* NAVBAR GROUPS */}
      <div className="flex items-center gap-2 justify-end">
        {/* Salesmen Avatars Group */}
        <div className="flex items-center mr-2 sm:mr-4 pr-2 sm:pr-4 border-r border-gray-200">
          {salesAgents.slice(0, maxAvatars).map((agent, i) => (
            <button
              key={agent.id}
              onClick={() => handleSalesmanClick(agent.id)}
              className={`cursor-pointer hover:opacity-80 transition-opacity relative flex-shrink-0 ${i > 0 ? '-ml-2 sm:-ml-3' : ''}`}
              style={{ zIndex: 10 - i }}
              title={agent.name}
            >
              {agent.avatar ? (
                <img
                  src={agent.avatar}
                  alt={agent.name}
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 border-white shadow-sm object-cover"
                />
              ) : (
                <div
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 border-white shadow-sm bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600"
                  title={agent.name}
                >
                  {agent.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
              )}
            </button>
          ))}
          {extraCount > 0 && (
            <button
              onClick={handleSalesTeamClick}
              className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs text-gray-500 font-semibold -ml-2 sm:-ml-3 cursor-pointer hover:bg-gray-200 transition-colors relative flex-shrink-0"
              style={{ zIndex: 8 }}
              title={`View all ${salesAgents.length} sales agents`}
            >
              +{extraCount}
            </button>
          )}
          <button
            onClick={handleAddSalesman}
            className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center text-gray-500 hover:bg-blue-50 ml-2 sm:ml-2 shadow-sm transition-colors relative flex-shrink-0"
            style={{ zIndex: 7 }}
            title="Add Sales Agent"
          >
            <Plus size={14} className="sm:w-4 sm:h-4" />
          </button>
        </div>
        {/* Message & Notification Group */}
        <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 border-r border-gray-200">
          <div className="p-2 w-9 h-9 rounded-full bg-white flex items-center justify-center cursor-pointer relative hover:bg-gray-100 transition" ref={msgRef}>
            <MessageCircle size={20} className="text-gray-500" onClick={() => { setShowMsgDropdown(v => !v); setShowNotifDropdown(false); setShowDropdown(false); }} />
          </div>
          <DropdownPortal anchorRef={msgRef} show={showMsgDropdown}>
            <div className="px-2 pt-2 text-center">
              <div className="font-bold text-xs text-gray-800 mb-2">Your Messages</div>
            </div>
            <div className="border-t border-gray-200" />
            <div className="px-6 py-6 text-gray-500 text-xs text-center">You have no messages</div>
            <div className="border-t border-gray-200" />
            <div className="flex justify-center py-2">
              <button className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-2 rounded-full text-xs shadow transition">View All Messages</button>
            </div>
          </DropdownPortal>
          <div className="p-2 w-9 h-9 rounded-full bg-white flex items-center justify-center cursor-pointer relative hover:bg-gray-100 transition" ref={notifRef}>
            <Bell size={20} className="text-gray-500" onClick={() => { setShowNotifDropdown(v => !v); setShowMsgDropdown(false); setShowDropdown(false); }} />
            <div className="absolute -top-1 -right-1 w-2 h-2 flex items-center justify-center bg-green-500 text-white rounded-full text-xs"></div>
          </div>
          <DropdownPortal anchorRef={notifRef} show={showNotifDropdown}>
            <div className="px-2 pt-2 text-center">
              <div className="font-bold text-xs text-gray-800 mb-2">Your Notifications</div>
            </div>
            <div className="border-t border-gray-200" />
            <div className="px-6 py-6 text-gray-500 text-xs text-center">You have no notifications</div>
            <div className="border-t border-gray-200" />
          </DropdownPortal>
        </div>
        {/* User Group */}
        <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-4">
          <div className="hidden sm:flex flex-col text-black max-w-[80px] truncate text-xs text-right">
            <span className="text-xs leading-3 font-medium truncate">{user?.firstName || 'User'}</span>
            <span className="text-[10px] text-gray-500 text-right truncate">{user?.email || ''}</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center cursor-pointer relative hover:bg-gray-100 transition overflow-hidden" ref={dropdownRef}>
            <div
              className="w-full h-full flex items-center justify-center"
              onClick={() => { setShowDropdown(v => !v); setShowNotifDropdown(false); setShowMsgDropdown(false); }}
            >
              {user?.avatar && user.avatar !== null && user.avatar.trim() !== '' ? (
                <Image
                  src={user.avatar}
                  alt={`${user.firstName || 'User'} avatar`}
                  width={36}
                  height={36}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <User size={20} className="text-gray-500" />
              )}
            </div>
          </div>
          {/* User dropdown menu using portal */}
          <DropdownPortal anchorRef={dropdownRef} show={showDropdown}>
            <div className="px-4 py-2 border-b">
              <p className="text-xs font-medium text-gray-900 truncate" title={user?.firstName}>{user?.firstName || 'User'}</p>
              <p className="text-xs text-gray-500" title={user?.email}>{user?.email || ''}</p>
            </div>
            <a 
              href="/settings" 
              className="block px-4 py-2 text-xs text-gray-700 hover:bg-gray-100"
              onClick={() => {
                setShowDropdown(false);
              }}
            >
              Account Settings
            </a>
            <button 
              className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-gray-100 flex items-center"
              onClick={handleSignOut}
            >
              <LogOut size={16} className="mr-2" />
              Sign out
            </button>
          </DropdownPortal>
        </div>
      </div>
    </div>
  );
};

export default Navbar;
