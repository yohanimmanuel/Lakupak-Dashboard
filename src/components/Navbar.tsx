import React from 'react';

const Navbar = () => (
  <header className="fixed left-60 top-0 right-0 h-15 bg-white border-b border-gray-200 flex items-center px-8 z-20">
    <div className="flex-1 flex items-center gap-4">
      <input
        type="text"
        placeholder="Search..."
        className="w-96 px-4 py-2 rounded-lg border border-gray-200 bg-[#e6e6e6] focus:outline-none focus:ring-2 focus:ring-[#0a61d7] text-sm"
      />
    </div>
    <div className="flex items-center gap-6">
      <div className="relative">
        <span className="inline-block p-2 rounded-full hover:bg-[#e6e6e6] cursor-pointer">
          <svg width="22" height="22" fill="none" stroke="#0a61d7" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
        </span>
        <span className="absolute top-2 right-2 w-2 h-2 bg-[#3ea73b] rounded-full border-2 border-white"></span>
      </div>
      <div className="w-10 h-10 rounded-full bg-[#e6e6e6] flex items-center justify-center font-bold text-[#0a61d7] text-lg">U</div>
    </div>
  </header>
);

export default Navbar;
