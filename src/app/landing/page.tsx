"use client";

import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { XIcon, CheckIcon, ChartBarIcon, ShoppingCartIcon, FileIcon, PackageIcon, RocketIcon, UserIcon, ChartAreaIcon, InstagramIcon, MailIcon, FacebookIcon } from "lucide-react";

export default function LandingPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-white">

      {/* Hero Section */}
      <section id="home" className="pt-10 pb-20 bg-gradient-to-br from-blue-50 via-white to-orange-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            {/* Left Content */}
             <div className="space-y-8">
               <div className="space-y-4">
                 <h1 className="mt-10 text-6xl font-bold text-gray-900 leading-tight animate-fade-in-up">
                   Where <span className="text-[#0a61d7]">Distributors</span> Trade &{" "}
                   <span className="text-orange-400">Retailers</span>{" "}
                   Shop Smarter
                 </h1>
                 <p className="text-lg text-gray-600 leading-relaxed max-w-2xl animate-fade-in-up animate-delay-200">
                   Instantly connect, order in bulk, grow your margins, power up sales and analyze business performance — all in one platform.
                 </p>
               </div>

              {/* CTA Buttons */}
               <div className="flex flex-col sm:flex-row gap-4">
                 <button
                   onClick={() => router.push("/register")}
                   className="bg-[#0a61d7] text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-[#084ba6] transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-1 animate-fade-in-up"
                 >
                   Get Started Free
                 </button>
                 <button className="border-2 border-gray-300 text-gray-700 px-8 py-4 rounded-lg text-lg font-semibold hover:border-orange-500 hover:text-orange-500 transition-all duration-200 animate-fade-in-up animate-delay-500">
                   Explore Markets →
                 </button>
               </div>

              {/* Social Proof */}
              <div className="flex items-center space-x-6 pt-4">
                <div className="flex items-center space-x-2">
                  <div className="flex text-yellow-400">
                    {[...Array(5)].map((_, i) => (
                      <svg key={i} className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <span className="text-gray-600">4.9 stars • 2,000+ reviews</span>
                </div>
              </div>
            </div>

            {/* Right - Product Screenshot */}
            <div className="flex justify-center lg:justify-end animate-fade-in-right animate-delay-300">
              <div className="w-[600px] h-[400px] bg-gray-200 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-300 hover-lift">
                <div className="text-center">
                  <div className="text-6xl mb-4">📱</div>
                  <p className="text-gray-500 text-lg font-medium">Put Product Screenshot Here</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pain Points vs Solution Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4 animate-fade-in-up">
              Transform Your Distribution Business
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto animate-fade-in-up animate-delay-200">
              See how Laku-Laku solves the biggest challenges in FMCG distribution
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            {/* Without Laku-Laku */}
            <div className="bg-red-50 rounded-2xl p-8 border border-red-100 animate-fade-in-left hover-lift">
              <div className="flex items-center mb-6">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mr-4">
                  <span className="text-2xl"> <XIcon className="text-red-500" size={35} /></span>
                </div>
                <h3 className="text-2xl font-bold text-red-800">Without Laku-Laku</h3>
              </div>
              <ul className="space-y-4">
                <li className="flex items-start">
                  <span className="text-red-500 mr-3 mt-1">•</span>
                  <span className="text-red-700">Manual order processing with spreadsheets and WhatsApp</span>
                </li>
                <li className="flex items-start">
                  <span className="text-red-500 mr-3 mt-1">•</span>
                  <span className="text-red-700">No visibility into inventory levels and sales performance</span>
                </li>
                <li className="flex items-start">
                  <span className="text-red-500 mr-3 mt-1">•</span>
                  <span className="text-red-700">Price wars and margin erosion from open competition</span>
                </li>
                <li className="flex items-start">
                  <span className="text-red-500 mr-3 mt-1">•</span>
                  <span className="text-red-700">Lost sales from inefficient replenishment cycles</span>
                </li>
              </ul>
            </div>

            {/* With Laku-Laku */}
            <div className="bg-green-50 rounded-2xl p-8 border border-green-100 animate-fade-in-right hover-lift">
              <div className="flex items-center mb-6">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mr-4">
                  <span className="text-2xl"> <CheckIcon className="text-green-500" size={35} /></span>
                </div>
                <h3 className="text-2xl font-bold text-green-800">With Laku-Laku</h3>
              </div>
              <ul className="space-y-4">
                <li className="flex items-start">
                  <span className="text-green-500 mr-3 mt-1">•</span>
                  <span className="text-green-700">Automated digital ordering with real-time inventory sync</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-3 mt-1">•</span>
                  <span className="text-green-700">Comprehensive analytics and performance insights</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-3 mt-1">•</span>
                  <span className="text-green-700">Protected pricing and controlled marketplace access</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-3 mt-1">•</span>
                  <span className="text-green-700">Smart replenishment with predictive ordering</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4 animate-fade-in-up">
              Two Powerful Platforms, One Seamless Experience
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto animate-fade-in-up animate-delay-200">
              Built specifically for FMCG distribution in Indonesia
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12">
                         {/* Distributor Dashboard */}
             <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow duration-300 animate-fade-in-left hover-lift">
              <div className="flex items-center mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mr-4">
                  <span className="text-3xl"> <ChartAreaIcon className="text-blue-500" size={35} /></span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">Distributor Dashboard</h3>
                  <p className="text-blue-600 font-medium">Complete Business Management</p>
                </div>
              </div>
              
              <div className="space-y-4 mb-6">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                  <span className="text-gray-700">Digital Catalog & Pricing Controls</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                  <span className="text-gray-700">Analytics & Sales Reports</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                  <span className="text-gray-700">Marketing Campaigns Inside Platform</span>
                </div>
              </div>

              <div className="w-full h-[200px] bg-gray-200 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300">
                <div className="text-center">
                  <div className="text-4xl mb-2">🖥️</div>
                  <p className="text-gray-500 font-medium">Dashboard Screenshot</p>
                  <p className="text-gray-400 text-sm">300x200px</p>
                </div>
              </div>
            </div>

                         {/* Retailer Marketplace */}
             <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow duration-300 animate-fade-in-right hover-lift">
              <div className="flex items-center mb-6">
                <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mr-4">
                  <span className="text-3xl"> <ShoppingCartIcon className="text-orange-500" size={35} /></span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">Retailer Marketplace</h3>
                  <p className="text-orange-600 font-medium">Smart Shopping Experience</p>
                </div>
              </div>
              
              <div className="space-y-4 mb-6">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-orange-500 rounded-full mr-3"></div>
                  <span className="text-gray-700">Bulk Ordering in One Click</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-orange-500 rounded-full mr-3"></div>
                  <span className="text-gray-700">Auto-Replenishment Suggestions</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-orange-500 rounded-full mr-3"></div>
                  <span className="text-gray-700">Real-Time Delivery Updates</span>
                </div>
              </div>

              <div className="w-full h-[200px] bg-gray-200 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300">
                <div className="text-center">
                  <div className="text-4xl mb-2">📱</div>
                  <p className="text-gray-500 font-medium">Marketplace Screenshot</p>
                  <p className="text-gray-400 text-sm">300x200px</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4 animate-fade-in-up">
              Trusted by Leading Distributors
            </h2>
            <p className="text-xl text-gray-600 animate-fade-in-up animate-delay-200">
              Join thousands of businesses already growing with Laku-Laku
            </p>
          </div>

          {/* Distributor Logos */}
           <div className="relative overflow-hidden mb-16">
             <div className="flex animate-scroll">
               {/* First set of logos */}
               {[...Array(12)].map((_, i) => (
                 <div key={i} className="flex-shrink-0 w-24 h-16 bg-gray-200 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300 mx-8">
                   <span className="text-gray-500 text-sm font-medium">Logo {i + 1}</span>
                 </div>
               ))}
             </div>
           </div>

                     {/* Testimonials */}
           <div className="grid md:grid-cols-2 gap-8">
             <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 animate-fade-in-left hover-lift">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mr-4">
                  <span className="text-xl"> <UserIcon className="text-blue-500" size={25} /></span>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">Ahmad Rahman</h4>
                  <p className="text-gray-600">CEO, PT Sukses Makmur</p>
                </div>
              </div>
              <p className="text-gray-700 italic">
                "Laku-Laku transformed our distribution business. We now manage 3x more products with half the effort."
              </p>
            </div>

                         <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 animate-fade-in-right hover-lift">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mr-4">
                  <span className="text-xl"> <UserIcon className="text-orange-500" size={25} /></span>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">Siti Nurhaliza</h4>
                  <p className="text-gray-600">Owner, Warung Makmur</p>
                </div>
              </div>
              <p className="text-gray-700 italic">
                "Ordering is now so easy! I get better prices and faster delivery. My customers are happier too."
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4 animate-fade-in-up">
              Get Started in 3 Simple Steps
            </h2>
            <p className="text-xl text-gray-600 animate-fade-in-up animate-delay-200">
              Join thousands of distributors and retailers already using Laku-Laku
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                icon: <FileIcon className="text-white" size={35} />,
                title: "Sign up & verify",
                description: "Create your account and complete business verification in minutes"
              },
              {
                step: "2",
                icon: <PackageIcon className="text-white" size={35} />,
                title: "List or browse bulk products",
                description: "Distributors list products, retailers browse and compare options"
              },
              {
                step: "3",
                icon: <RocketIcon className="text-white" size={35} />,
                title: "Order & track seamlessly",
                description: "Place orders, track deliveries, and manage your business all in one place"
              }
                         ].map((item, index) => (
               <div key={index} className="text-center animate-fade-in-up" style={{ animationDelay: `${(index + 1) * 200}ms` }}>
                 <div className="relative">
                   <div className="w-20 h-20 bg-[#0a61d7] rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce-in">
                     <span className="text-3xl">{item.icon}</span>
                   </div>
                 </div>
                 <div className="bg-gray-50 rounded-full w-8 h-8 flex items-center justify-center mx-auto mb-4">
                   <span className="text-white font-bold text-sm bg-[#0a61d7] rounded-full w-6 h-6 flex items-center justify-center">
                     {item.step}
                   </span>
                 </div>
                 <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
                 <p className="text-gray-600 leading-relaxed">{item.description}</p>
               </div>
             ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-30 bg-gradient-to-r from-[#0a61d7] to-[#084ba6]">
                 <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
           <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 animate-fade-in-up">
             Stop selling like it's 1990.
             <br />
             Start trading like it's 2030.
           </h2>
           <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto animate-fade-in-up animate-delay-200">
             Join the digital revolution in FMCG distribution. Transform your business today.
           </p>
           <button
             onClick={() => router.push("/register")}
             className="bg-orange-500 text-white px-12 py-5 rounded-lg text-xl font-bold hover:bg-orange-600 transition-all duration-200 shadow-2xl hover:shadow-orange-500/25 transform hover:-translate-y-1 animate-fade-in-up"
           >
             Get Started Free
           </button>
         </div>
      </section>

    </div>
  );
}
