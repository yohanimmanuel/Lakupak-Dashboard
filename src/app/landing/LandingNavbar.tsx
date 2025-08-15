"use client";
import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function LandingNavbar() {
  const router = useRouter();
  return (
    <nav className="fixed top-0 w-full bg-white/30 backdrop-blur-lg border-b border-white/30 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <div className="flex items-center">
            <Image src="/LakuLakuTextLogo.svg" alt="Laku-Laku Logo" width={200} height={100} />
          </div>
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-10">
            <button onClick={() => router.push("/landing")} className="text-gray-700 hover:text-[#0a61d7] transition-colors bg-transparent border-none cursor-pointer">Home</button>
            <button onClick={() => router.push("/landing/features")} className="text-gray-700 hover:text-[#0a61d7] transition-colors bg-transparent border-none cursor-pointer">Features</button>
            <button onClick={() => router.push("/landing/pricing")} className="text-gray-700 hover:text-[#0a61d7] transition-colors bg-transparent border-none cursor-pointer">Pricing</button>
            <button onClick={() => router.push("/landing/solutions")} className="text-gray-700 hover:text-[#0a61d7] transition-colors bg-transparent border-none cursor-pointer">Solutions</button>
            <button onClick={() => router.push("/landing/about")} className="text-gray-700 hover:text-[#0a61d7] transition-colors bg-transparent border-none cursor-pointer">About</button>
          </div>
          {/* CTA Buttons */}
          <div className="flex items-center space-x-6">
            <button onClick={() => router.push("/login")}
              className="text-gray-700 hover:text-[#0a61d7] transition-colors">Sign In</button>
            <button onClick={() => router.push("/register")}
              className="bg-[#0a61d7] text-white px-6 py-2.5 rounded-lg hover:bg-[#084ba6] transition-colors shadow-lg hover:shadow-xl">Get Started</button>
          </div>
        </div>
      </div>
    </nav>
  );
}
