"use client";
import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation Bar */}
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
      <div className="pt-20">{children}</div>
      {/* Footer */}
      <footer className="bg-gray-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            {/* Company Info */}
            <div className="col-span-2 animate-fade-in-up">
              <div className="flex items-center mb-4">
                <Image src="/LakuLakuwTextLogo.svg" alt="Laku-Laku Logo" width={200} height={10} />
              </div>
              <p className="text-gray-400 mb-6 max-w-md">
                The complete B2B platform for FMCG distributors and retailers in Indonesia.
                Streamline operations, protect pricing, and grow your business securely.
              </p>
              <div className="flex space-x-4">
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-[#0a61d7] transition-colors cursor-pointer">
                  <span><Image src="/instagram.svg" alt="Instagram" width={20} height={20} /></span>
                </div>
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-[#0a61d7] transition-colors cursor-pointer">
                  <span><Image src="/facebook.svg" alt="Facebook" width={20} height={20} /></span>
                </div>
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-[#0a61d7] transition-colors cursor-pointer">
                  <span><Image src="/gmail.svg" alt="Mail" width={20} height={20} /></span>
                </div>
              </div>
            </div>
            {/* Quick Links */}
            <div className="animate-fade-in-up animate-delay-200">
              <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
              <ul className="space-y-2">
                <li><a href="/landing/pricing" className="text-gray-400 hover:text-white transition-colors">Pricing</a></li>
                <li><a href="/landing/features" className="text-gray-400 hover:text-white transition-colors">Features</a></li>
                <li><a href="/landing/solutions" className="text-gray-400 hover:text-white transition-colors">Solutions</a></li>
                <li><a href="/landing/about" className="text-gray-400 hover:text-white transition-colors">About</a></li>
              </ul>
            </div>
            {/* Support */}
            <div className="animate-fade-in-up animate-delay-400">
              <h3 className="text-lg font-semibold mb-4">Support</h3>
              <ul className="space-y-2">
                <li><a href="#help" className="text-gray-400 hover:text-white transition-colors">Help Center</a></li>
                <li><a href="#contact" className="text-gray-400 hover:text-white transition-colors">Contact Us</a></li>
                <li><a href="#docs" className="text-gray-400 hover:text-white transition-colors">Documentation</a></li>
                <li><a href="#status" className="text-gray-400 hover:text-white transition-colors">System Status</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-12 pt-8 text-center">
            <p className="text-gray-400">
              © 2024 Laku-Laku. All rights reserved. Made with ❤️ for Indonesia's Distribution and Retail industry.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
