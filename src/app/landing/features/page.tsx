"use client";
import React, { useRef, useEffect, useState } from "react";
import { BarChart3Icon, ShoppingCartIcon, CreditCardIcon, PackageIcon, SmartphoneIcon, FileTextIcon, XIcon, CheckIcon, ChartAreaIcon } from "lucide-react";
import { useRouter } from "next/navigation";

const distributorFeatures = [
  {
    badge: "AI Powered",
    title: "AI Sales Forecasting",
    subtitle: "Optimize your business with predictive analytics.",
    points: [
      "Get demand predictions for every SKU.",
      "Plan production and procurement with confidence.",
      "Reduce overstock and lost sales."
    ],
    icon: <BarChart3Icon className="text-blue-500" size={45} />, 
    image: "[Image]"
  },
  {
    badge: "Finance",
    title: "Payment & Credit Management",
    subtitle: "Flexible, secure, and integrated payments.",
    points: [
      "Offer credit terms to trusted retailers.",
      "Track invoices and payment status in real time.",
      "Receive secure payments directly in the platform."
    ],
    icon: <CreditCardIcon className="text-blue-500" size={45} />, 
    image: "[Image]"
  },
  {
    badge: "Dashboard",
    title: "Centralized Product Dashboard",
    subtitle: "All your SKUs, pricing, and stock in one place.",
    points: [
      "Bulk upload and edit products in seconds.",
      "Manage pricing and stock from a single interface.",
      "Instantly sync changes to all connected retailers."
    ],
    icon: <FileTextIcon className="text-blue-500" size={45} />, 
    image: "[Image]"
  }
];

const retailerFeatures = [
  {
    badge: "Smart Order",
    title: "Smart Bulk Ordering",
    subtitle: "Order smarter, restock faster.",
    points: [
      "Get the best price with minimum order optimization.",
      "One-click reordering for your most-purchased products.",
      "See available promotions instantly."
    ],
    icon: <ShoppingCartIcon className="text-orange-500" size={45} />, 
    image: "[Image]"
  },
  {
    badge: "Realtime",
    title: "Real-Time Delivery Updates",
    subtitle: "Track every shipment, every time.",
    points: [
      "Instant notifications for every order.",
      "Track shipments from warehouse to your store.",
      "Never miss a delivery again."
    ],
    icon: <PackageIcon className="text-orange-500" size={45} />, 
    image: "[Image]"
  },
  {
    badge: "Mobile",
    title: "Mobile-First Experience",
    subtitle: "Order and track on the go.",
    points: [
      "Seamless experience on any device.",
      "Order and track shipments anytime, anywhere.",
      "Get support and insights from your phone."
    ],
    icon: <SmartphoneIcon className="text-orange-500" size={45} />, 
    image: "[Image]"
  }
];

function StickyFeatureSection({
  features,
  stickyTitle,
  stickySubtitle,
  color,
}: {
  features: typeof distributorFeatures;
  stickyTitle: string;
  stickySubtitle: string;
  color: string;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const descRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      let found = 0;
      descRefs.current.forEach((ref, idx) => {
        if (ref) {
          const rect = ref.getBoundingClientRect();
          if (rect.top < window.innerHeight / 2) {
            found = idx;
          }
        }
      });
      setActiveIdx(found);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Height of sticky block (adjust if needed)
  const stickyOffset = 140; // px

  return (
    <div ref={sectionRef} className="relative max-w-6xl mx-auto mb-32">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* Sticky Block: Title, Subtitle, and Image together */}
        <div className="hidden md:flex flex-col justify-start">
          <div className="sticky" style={{ top: `${stickyOffset}px` }}>
            <div className="bg-white/95 rounded-2xl p-2 flex flex-col shadow-none">
              <h2 className={`text-4xl font-bold mb-2 ${color}`}>{stickyTitle}</h2>
              <p className="text-md text-gray-500 mb-6">{stickySubtitle}</p>
              <div className="relative w-[500px] h-[300px]">
                {features.map((feature, idx) => (
                  <div
                    key={idx}
                    className={`absolute inset-0 flex items-center justify-center transition-opacity duration-700 ${activeIdx === idx ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                  >
                    <div className="w-full h-full bg-gray-200 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-300 text-gray-500 text-lg font-medium shadow-xl">
                      {feature.image}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Feature Descriptions */}
        <div className="flex flex-col space-y-40 mt-20">
          {features.map((feature, idx) => (
            <div
              key={idx}
              ref={(el: HTMLDivElement | null) => {
                descRefs.current[idx] = el;
              }}
              className={`transition-opacity duration-700 ${activeIdx === idx ? 'opacity-100' : 'opacity-40'} flex flex-col justify-center min-h-[400px]`}
            >
              <span className={`inline-block mb-2 px-3 py-1 text-xs font-semibold rounded-full ${color === 'text-blue-700' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>{feature.badge}</span>
              <div className="flex items-center mb-2">
                <span className="mr-3">{feature.icon}</span>
                <h3 className="text-3xl font-bold text-gray-900">{feature.title}</h3>
              </div>
              <p className="text-gray-600 mb-3 text-lg">{feature.subtitle}</p>
              <ul className="list-disc pl-5 space-y-2 text-gray-700 text-base">
                {feature.points.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FeaturesPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-white">
      <div className="w-full">
        {/* Combined Header Section */}
        <div className="flex flex-col items-center justify-center text-center py-20 gap-6">
          <h1 className="text-5xl font-bold text-gray-900 mb-2 animate-fade-in-up">Laku-Laku Features</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto animate-fade-in-up animate-delay-200 mb-2">
            Discover the tools that empower distributors and retailers to grow, automate, and thrive in Indonesia's FMCG market.
          </p>
          <div className="flex items-center justify-center gap-6 mb-2">
            <button className="bg-[#0a61d7] text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-[#084ba6] transition-all duration-200 shadow-lg hover:shadow-xl">
              Consult Us
            </button>
            <button 
              onClick={() => router.push("/register")}
              className="bg-white text-[#0a61d7] border border-[#0a61d7] px-8 py-3 rounded-lg text-lg font-semibold hover:bg-[#e6f0fa] transition-all duration-200">
              Register Now
            </button>
          </div>
          <div className="flex flex-col items-center mb-2 animate-fade-in-up animate-delay-300">
            <div className="flex items-center space-x-2 mb-2">
              {[...Array(5)].map((_, i) => (
                <svg key={i} className="w-6 h-6 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <span className="text-gray-600 text-lg mb-2">4.9 stars • 2,000+ reviews</span>
          </div>
          {/* Video Placeholder */}
          <div className="w-[1200px] h-[600px] bg-gray-200 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-gray-300 mb-2">
            <svg className="w-16 h-16 text-gray-400 mb-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <polygon points="9.5,7.5 16.5,12 9.5,16.5" fill="currentColor" />
              <rect x="2" y="2" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
            <span className="text-gray-500 text-lg font-medium">Laku-Laku Product Video</span>
          </div>
        </div>

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
      <section className="py-20 bg-gray-50 mb-20">
        <div className="w-full flex flex-col items-center">
          <div className="text-center mb-16 w-full">
            <h2 className="text-4xl font-bold text-gray-900 mb-4 animate-fade-in-up">
              Two Powerful Platforms, One Seamless Experience
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto animate-fade-in-up animate-delay-200">
              Built specifically for FMCG distribution in Indonesia
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-8 justify-center">
                         {/* Distributor Dashboard */}
             <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow duration-300 animate-fade-in-left hover-lift w-[600px]">
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
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                  <span className="text-gray-700">AI Sales Forecasting and Management</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                  <span className="text-gray-700">Centralized Product Management</span>
                </div>
              </div>

              <div className="w-full h-[350px] bg-gray-200 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300">
                <div className="text-center">
                  <div className="text-4xl mb-2">🖥️</div>
                  <p className="text-gray-500 font-medium">Dashboard Screenshot</p>
                  <p className="text-gray-400 text-sm">300x200px</p>
                </div>
              </div>
            </div>

                         {/* Retailer Marketplace */}
             <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow duration-300 animate-fade-in-right hover-lift w-[600px]">
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
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-orange-500 rounded-full mr-3"></div>
                  <span className="text-gray-700">Mobile-First Experience</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-orange-500 rounded-full mr-3"></div>
                  <span className="text-gray-700">Smart Shopping Experience</span>
                </div>
              </div>

              <div className="w-full h-[350px] bg-gray-200 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300">
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

        
        {/* Distributor Sticky Section */}
        <StickyFeatureSection
          features={distributorFeatures}
          stickyTitle="For Distributors"
          stickySubtitle="Supercharge your business with AI, automation, and centralized control."
          color="text-blue-700"
        />
        {/* Retailer Sticky Section */}
        <StickyFeatureSection
          features={retailerFeatures}
          stickyTitle="For Retailers"
          stickySubtitle="Shop smarter, restock faster, and manage your store from anywhere."
          color="text-orange-700"
        />
        {/* CTA Section with Product Image Placeholder */}
        <section className="py-20 bg-gradient-to-r from-[#0a61d7] to-[#084ba6] mt-20 w-full">
          <div className="w-full flex flex-col items-center justify-center px-0 text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 animate-fade-in-up">
              Ready to power up your distribution?
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
            <div className="flex justify-center gap-6 mt-15 w-full">
              <div className="flex flex-col items-center">
                <div className="w-[690px] h-[450px] bg-gray-200 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-300 mx-auto">
                  <span className="text-gray-500 text-lg font-medium">[Dashboard Screenshot]</span>
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-[500px] h-[450px] bg-gray-200 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-300 mx-auto">
                  <span className="text-gray-500 text-lg font-medium">[Mobile App Screenshot]</span>
                </div>
              </div>
            </div>
            <div className="flex justify-center gap-6 mt-6 w-full">
              <div className="flex flex-col items-center">
                <div className="w-[389px] h-[250px] bg-gray-200 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-300 mx-auto">
                  <span className="text-gray-500 text-lg font-medium">[Dashboard Screenshot]</span>
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-[389px] h-[250px] bg-gray-200 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-300 mx-auto">
                  <span className="text-gray-500 text-lg font-medium">[Marketplace Screenshot]</span>
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-[389px] h-[250px] bg-gray-200 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-300 mx-auto">
                  <span className="text-gray-500 text-lg font-medium">[Mobile App Screenshot]</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
