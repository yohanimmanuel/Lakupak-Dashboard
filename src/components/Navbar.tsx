'use client';

import Image from "next/image";
import { Search, MessageCircle, Bell, User, LogOut, Plus } from 'lucide-react';
import { Menu as MenuIcon } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useUserStore } from '@/store/userStore';
import ReactDOM from 'react-dom';
import { useMenuContext } from '@/app/(dashboard)/(menulist)/DashboardClientLayout';
import { useRouter } from 'next/navigation';

const DROPDOWN_WIDTH = 300;

const salesmen = [
  { name: 'Jane Doe', avatar: 'https://randomuser.me/api/portraits/women/44.jpg' },
  { name: 'Anna Smith', avatar: 'https://randomuser.me/api/portraits/women/47.jpg' },
  { name: 'John Lee', avatar: 'https://randomuser.me/api/portraits/men/32.jpg' },
  { name: 'Mike Brown', avatar: 'https://randomuser.me/api/portraits/men/45.jpg' },
];

const DropdownPortal = ({ anchorRef, show, children }: any) => {
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
    <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: DROPDOWN_WIDTH, zIndex: 50 }} className="border border-gray-200 bg-white rounded-xl shadow-2xl py-0 px-0 mt-1">
      {children}
    </div>,
    document.body
  );
};

const Navbar = () => {
  const user = useUserStore(state => state.user);
  const clearUser = useUserStore(state => state.clearUser);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showMsgDropdown, setShowMsgDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const { toggleMenu } = useMenuContext();
  const [hasMounted, setHasMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifDropdown(false);
      }
      if (msgRef.current && !msgRef.current.contains(event.target as Node)) {
        setShowMsgDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSignOut = () => {
    clearUser();
    router.push('/login');
  };

  const handleAddSalesman = () => {
    alert('Add new salesman (functionality to be implemented)');
  };

  const formatRole = (role: string) => {
    if (!role) return '';
    return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
  };

  if (!hasMounted) return null;

  const maxAvatars = 3;
  const extraCount = salesmen.length - maxAvatars;

  return (
    <div className="flex items-center justify-between p-4 z-30 relative bg-white border-b border-gray-200 h-16">
      {/* MENU COLLAPSE BUTTON */}
      <button
        className="mr-4 p-2 rounded-lg hover:bg-gray-200 transition-all duration-100 flex-shrink-0 group"
        aria-label="Toggle menu"
        onClick={toggleMenu}
      >
        <MenuIcon size={20} className="text-gray-700 transition-colors duration-100" />
      </button>
      {/* SEARCH BAR */}
      <div className="flex-1 flex items-left justify-left">
        <div className="relative w-[400px] max-w-full">
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
      <div className="flex items-center gap-0 justify-end">
        {/* Salesmen Avatars Group */}
        <div className="flex items-center gap-1 mr-2 pr-4 border-r border-gray-200">
          {salesmen.slice(0, maxAvatars).map((s, i) => (
            <img
              key={s.name}
              src={s.avatar}
              alt={s.name}
              className={`w-7 h-7 rounded-full border-2 border-white -ml-2 first:ml-0 shadow-sm object-cover`}
              title={s.name}
              style={{ zIndex: 10 - i }}
            />
          ))}
          {extraCount > 0 && (
            <span className="w-7 h-7 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs text-gray-500 font-semibold -ml-2" style={{ zIndex: 8 }}>
              +{extraCount}
            </span>
          )}
          <button
            onClick={handleAddSalesman}
            className="w-7 h-7 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center text-gray-500 hover:bg-blue-50 ml-1 shadow-sm"
            title="Add Salesman"
          >
            <Plus size={16} />
          </button>
        </div>
        {/* Message & Notification Group */}
        <div className="flex items-center gap-4 px-4 border-r border-gray-200">
          <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center cursor-pointer relative hover:bg-gray-100 transition" ref={msgRef}>
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
          <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center cursor-pointer relative hover:bg-gray-100 transition" ref={notifRef}>
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
        <div className="flex items-center gap-4 pl-4">
          <div className="flex flex-col text-black max-w-[60px] truncate text-xs text-right">
            <span className="text-xs leading-3 font-medium truncate">{user?.name || 'User'}</span>
            <span className="text-[10px] text-gray-500 text-right truncate">{user?.email || ''}</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center cursor-pointer relative hover:bg-gray-100 transition" ref={dropdownRef}>
            <div
              className="w-full h-full flex items-center justify-center"
              onClick={() => { setShowDropdown(v => !v); setShowNotifDropdown(false); setShowMsgDropdown(false); }}
            >
              <User size={20} className="text-gray-500" />
            </div>
            {/* User dropdown menu */}
            {showDropdown && (
              <div className="absolute right-0 top-[135%] min-w-[230px] max-w-[350px] w-max border border-gray-200 bg-white rounded-lg shadow-lg py-1 z-10 break-words">
                <div className="px-4 py-2 border-b">
                  <p className="text-xs font-medium text-gray-900 truncate" title={user?.name}>{user?.name || 'User'}</p>
                  <p className="text-xs text-gray-500" title={user?.email}>{user?.email || ''}</p>
                </div>
                <a href="/settings" className="block px-4 py-2 text-xs text-gray-700 hover:bg-gray-100">
                  Account Settings
                </a>
                <button 
                  className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-gray-100 flex items-center"
                  onClick={handleSignOut}
                >
                  <LogOut size={16} className="mr-2" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Navbar;
