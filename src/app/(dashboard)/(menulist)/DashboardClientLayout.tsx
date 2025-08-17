'use client';

import React, { useState, createContext, useContext } from 'react';
import Menu from '@/components/Menu';
import Navbar from '@/components/Navbar';

const MenuContext = createContext({
  isCollapsed: false,
  toggleMenu: () => {},
});
export const useMenuContext = () => useContext(MenuContext);

export default function DashboardClientLayout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const toggleMenu = () => setIsCollapsed(v => !v);

  return (
    <MenuContext.Provider value={{ isCollapsed, toggleMenu }}>
      <div className="h-screen flex overflow-hidden" data-layout>
        <div className={`${isCollapsed ? 'w-[70px]' : 'w-[15%]'} bg-white transition-all duration-300 border border-gray-200 min-w-[70px]`}>
          <Menu />
        </div>
        <div className={`${isCollapsed ? 'w-[calc(100%-70px)]' : 'w-[85%]'} bg-white transition-all duration-300 flex flex-col overflow-hidden`}>
          <div className="flex-shrink-0">
            <Navbar />
          </div>
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </div>
      </div>
    </MenuContext.Provider>
  );
}
