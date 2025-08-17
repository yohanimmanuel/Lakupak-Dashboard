import React from 'react';
import Menu from '@/components/Menu';
import Navbar from '@/components/Navbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#f7f8fa]">
      <Menu />
      <div className="flex-1 flex flex-col" style={{ marginLeft: 240 }}>
        <Navbar />
        <main className="flex-1 pt-20 px-8 pb-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
