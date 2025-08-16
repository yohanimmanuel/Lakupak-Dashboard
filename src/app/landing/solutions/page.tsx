"use client";

import React, { useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserIcon, StarIcon, CheckCircleIcon, ShoppingCartIcon, BarChart2Icon, FileTextIcon, TrendingUpIcon, GiftIcon, TruckIcon, CreditCardIcon, ClockIcon, StoreIcon } from "lucide-react";
import Image from "next/image";

export default function SolutionsPage() {
  const router = useRouter();
  // --- Testimonial auto-scroll logic ---
  const testimonials = [
    { name: "Andi", role: "Distributor from Surabaya", color: "blue", review: "Laku-Laku helped us triple our reach without hiring more sales staff. Orders are processed in half the time." },
    { name: "Rina", role: "Mini-Mart Owner in Jakarta", color: "orange", review: "I used to call 5 suppliers to check prices. Now I do it all in one app and save up to 20% every month." },
    { name: "Ahmad Rahman", role: "CEO, PT Sukses Makmur", color: "blue", review: "Laku-Laku transformed our distribution business. We now manage 3x more products with half the effort." },
    { name: "Siti Nurhaliza", role: "Owner, Warung Makmur", color: "orange", review: "Ordering is now so easy! I get better prices and faster delivery. My customers are happier too." },
    { name: "Budi Santoso", role: "Retailer, Bandung", color: "blue", review: "The app is super easy to use and the support team is very responsive." },
    { name: "Maya Dewi", role: "Distributor, Medan", color: "orange", review: "Bulk deals and analytics helped me grow my business faster than ever." },
  ];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [repeatCount, setRepeatCount] = React.useState(2);

  // Dynamically repeat testimonials so scroll area is at least 2x container width
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const card = container.querySelector('.testimonial-card');
    if (!card) return;
    const cardWidth = (card as HTMLElement).offsetWidth + 32; // 32px gap
    const containerWidth = container.offsetWidth;
    const minContentWidth = containerWidth * 2;
    const needed = Math.ceil(minContentWidth / (cardWidth * testimonials.length));
    setRepeatCount(Math.max(2, needed));
  }, [testimonials.length]);

  // Auto-scroll and seamless loop
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let frame: number;
    let scrollAmount = 0.5; // px per frame
    const card = container.querySelector('.testimonial-card');
    if (!card) return;
    const cardWidth = (card as HTMLElement).offsetWidth + 32;
    const totalWidth = cardWidth * testimonials.length * repeatCount;
    function step() {
      if (!container) return;
      container.scrollLeft += scrollAmount;
      // Loop: if at end of first set, reset to start
      if (container.scrollLeft >= (cardWidth * testimonials.length)) {
        container.scrollLeft = 0;
      }
      frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [repeatCount, testimonials.length]);

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative pt-16 pb-24 bg-gradient-to-br from-blue-50 via-white to-orange-50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-gray-900 mb-4 animate-fade-in-up">
              Solutions for Distributors & Retailers
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto animate-fade-in-up animate-delay-200">
              Laku-Laku connects wholesalers with small retailers nationwide, making bulk buying and selling seamless, efficient, and profitable for everyone.
            </p>
            <button
              onClick={() => router.push("/register")}
              className="mt-8 bg-[#0a61d7] text-white px-10 py-4 rounded-lg text-lg font-semibold hover:bg-[#084ba6] transition-all duration-200 shadow-lg hover:shadow-xl animate-fade-in-up animate-delay-400"
            >
              Get Started Today
            </button>
          </div>
          {/* Image Showcase with Decorations - relative wrapper */}
          <div className="flex justify-center mb-16 relative">
            {/* Floating Badges OUTSIDE the image showcase */}
            {/* Left Badge Group */}
            <div className="absolute left-60 top-50 z-30 pointer-events-none" style={{transform: 'translate(-270px, -50%)'}}>
              <div className="flex flex-col items-start">
                <div className="bg-white px-5 py-2 rounded-full shadow-lg text-sm font-semibold text-[#0a61d7] border border-blue-100 mb-2 pointer-events-auto">
                  Nationwide Retailer Access
                </div>
                <div className="bg-white px-5 py-2 rounded-full shadow text-xs font-medium text-gray-700 border border-blue-100 mt-2 pointer-events-auto">
                  Sell to <span className="font-bold text-green-600">10,000+</span> stores
                </div>
              </div>
            </div>
            {/* Right Badge Group */}
            <div className="absolute right-50 top-70 z-30 pointer-events-none" style={{transform: 'translate(270px, -50%)'}}>
              <div className="flex flex-col items-end">
                <div className="bg-white px-5 py-2 rounded-full shadow-lg text-sm font-semibold text-orange-600 border border-orange-100 mb-2 pointer-events-auto">
                  Bulk Savings & Fast Delivery
                </div>
                <div className="bg-white px-5 py-2 rounded-full shadow text-xs font-medium text-gray-700 border border-orange-100 mt-2 pointer-events-auto">
                  Save up to <span className="font-bold text-green-600">30%</span> on every order
                </div>
              </div>
            </div>
            {/* Image Showcase */}
            <div className="w-full max-w-5xl aspect-[2/1] bg-white rounded-2xl shadow-sm flex items-center justify-center relative overflow-hidden">
              {/* Left Image */}
              <div className="relative w-1/2 h-full">
                <Image
                  src="/femaleworkerwarehouse.png"
                  alt="Female Worker Warehouse"
                  fill
                  quality={100}
                  style={{ objectFit: "cover", borderTopLeftRadius: '1rem', borderBottomLeftRadius: '1rem' }}
                  className="object-cover"
                  sizes="(min-width:1280px) 900px, (min-width:1024px) 700px, 100vw"
                  priority
                />
              </div>
              {/* Right Image */}
              <div className="relative w-1/2 h-full">
                <Image
                  src="/deliveryman.png"
                  alt="Ecommerce Delivery Man"
                  fill
                  quality={100}
                  style={{ objectFit: "cover", borderTopRightRadius: '1rem', borderBottomRightRadius: '1rem' }}
                  className="object-cover"
                  sizes="(min-width:1280px) 900px, (min-width:1024px) 700px, 100vw"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
        {/* Background Illustration */}
        <div className="absolute inset-0 pointer-events-none">
          <svg width="100%" height="100%" viewBox="0 0 1440 320" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 left-0 w-full h-64 opacity-30">
            <path fill="#0a61d7" fillOpacity="0.1" d="M0,160L60,170.7C120,181,240,203,360,197.3C480,192,600,160,720,133.3C840,107,960,85,1080,101.3C1200,117,1320,171,1380,197.3L1440,224L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z" />
          </svg>
        </div>
      </section>

      {/* Two-Column Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold text-gray-900 mb-4 animate-fade-in-up">Solutions for Every Business</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto animate-fade-in-up animate-delay-200">Whether you’re a distributor or retailer, Laku-Laku empowers you to grow, save, and succeed in Indonesia’s wholesale market.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-12">
            {/* Left Column - Distributors */}
            <div className="bg-blue-50 rounded-2xl p-10 border border-blue-100 shadow-md animate-fade-in-left hover-lift">
              <h2 className="text-2xl font-bold text-blue-800 mb-6">Sell Smarter, Grow Faster <span className="block text-base text-blue-600 font-medium">(For Distributors)</span></h2>
              <ul className="space-y-5 text-lg">
                <li className="flex items-start"><CheckCircleIcon className="text-green-400 mr-3 mt-1" size={28} /><span className="text-gray-800"><b>Access to Thousands of Retailers</b>: Your products in front of a verified nationwide retail network.</span></li>
                <li className="flex items-start"><BarChart2Icon className="text-green-400 mr-3 mt-1" size={24} /><span className="text-gray-800"><b>Centralized Dashboard</b>: Manage stock, pricing, and orders in one place.</span></li>
                <li className="flex items-start"><FileTextIcon className="text-green-400 mr-3 mt-1" size={24} /><span className="text-gray-800"><b>Automated Payments & Invoicing</b>: Get paid faster with less admin work.</span></li>
                <li className="flex items-start"><TrendingUpIcon className="text-green-400 mr-3 mt-1" size={24} /><span className="text-gray-800"><b>Performance Analytics</b>: See which products perform best and optimize your offers.</span></li>
                <li className="flex items-start"><GiftIcon className="text-green-400 mr-3 mt-1" size={24} /><span className="text-gray-800"><b>Promotions & Bulk Deals</b>: Run targeted campaigns to boost sales.</span></li>
              </ul>
            </div>
            {/* Right Column - Retailers */}
            <div className="bg-orange-50 rounded-2xl p-10 border border-orange-100 shadow-md animate-fade-in-right hover-lift">
              <h2 className="text-2xl font-bold text-orange-800 mb-6">Buy Better, Save More <span className="block text-base text-orange-600 font-medium">(For Retailers)</span></h2>
              <ul className="space-y-5 text-lg">
                <li className="flex items-start"><ShoppingCartIcon className="text-blue-400 mr-3 mt-1" size={24} /><span className="text-gray-800"><b>One-Stop Wholesale Shopping</b>: Multiple suppliers, one cart, one payment.</span></li>
                <li className="flex items-start"><StoreIcon className="text-blue-400 mr-3 mt-1" size={24} /><span className="text-gray-800"><b>Exclusive Wholesale Pricing</b>: Bulk deals and seasonal promos you can’t find elsewhere.</span></li>
                <li className="flex items-start"><ClockIcon className="text-blue-400 mr-3 mt-1" size={24} /><span className="text-gray-800"><b>Real-Time Stock Updates</b>: See exactly what’s available before ordering.</span></li>
                <li className="flex items-start"><CreditCardIcon className="text-blue-400 mr-3 mt-1" size={19} /><span className="text-gray-800"><b>Flexible Payments</b>: Pay instantly or apply for trade credit.</span></li>
                <li className="flex items-start"><TruckIcon className="text-blue-400 mr-3 mt-1" size={24} /><span className="text-gray-800"><b>Fast, Reliable Delivery</b>: Optimized routes and consolidated shipments save time and money.</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold text-gray-900 mb-4 animate-fade-in-up">What Our Users Say</h2>
            <div className="flex justify-center mb-2">
              {[...Array(5)].map((_, i) => (
                <StarIcon key={i} className="text-yellow-400 w-7 h-7" fill="#facc15" />
              ))}
            </div>
          </div>
          {/* Horizontally auto-scrolling reviews */}
          <div
            ref={scrollRef}
            className="overflow-x-auto whitespace-nowrap pb-4 group hide-scrollbar"
            style={{ WebkitOverflowScrolling: 'touch', scrollBehavior: 'smooth' }}
          >
            <div className="flex gap-8">
              {Array.from({ length: repeatCount }).flatMap((_, repIdx) =>
                testimonials.map((item, idx) => (
                  <div
                    key={repIdx + '-' + idx}
                    className="testimonial-card inline-block min-w-[350px] max-w-[400px] bg-gray-50 border border-gray-200 rounded-2xl p-8 align-top mr-2 animate-fade-in-up"
                    style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}
                  >
                    <div className="flex items-center mb-4">
                      <div className={`w-14 h-14 bg-${item.color}-100 rounded-full flex items-center justify-center mr-4 overflow-hidden`}>
                        <UserIcon className={`text-${item.color}-500 w-8 h-8`} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{item.name}</h4>
                        <p className="text-gray-600 text-sm">{item.role}</p>
                      </div>
                    </div>
                    <p className="text-gray-700 italic">“{item.review}”</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 3 Simple Steps Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4 animate-fade-in-up">Get Started in 3 Simple Steps</h2>
            <p className="text-xl text-gray-600 animate-fade-in-up animate-delay-200">Join thousands of distributors and retailers already using Laku-Laku</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                icon: <FileTextIcon className="text-white" size={35} />,
                title: "Sign up & verify",
                description: "Create your account and complete business verification in minutes"
              },
              {
                step: "2",
                icon: <ShoppingCartIcon className="text-white" size={35} />,
                title: "List or browse bulk products",
                description: "Distributors list products, retailers browse and compare options"
              },
              {
                step: "3",
                icon: <TrendingUpIcon className="text-white" size={35} />,
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
      <section className="py-24 bg-gradient-to-r from-[#0a61d7] to-[#084ba6]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 animate-fade-in-up">
            Ready to Level Up Your Wholesale Business?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto animate-fade-in-up animate-delay-200">
            Join thousands of retailers and distributors growing with Laku-Laku.
          </p>
          <button
            onClick={() => router.push("/register")}
            className="bg-orange-500 text-white px-12 py-5 rounded-lg text-xl font-bold hover:bg-orange-600 transition-all duration-200 shadow-2xl hover:shadow-orange-500/25 transform hover:-translate-y-1 animate-fade-in-up"
          >
            Get Started Today
          </button>
        </div>
      </section>
    </div>
  );
}
