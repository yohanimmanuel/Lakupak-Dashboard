"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { BookOpenIcon, SparklesIcon, ArrowLeftIcon, ArrowRightIcon } from "lucide-react";

export default function AboutPage() {
  const router = useRouter();
  const [activeSlide, setActiveSlide] = React.useState(0);
  const slides = [
    {
      title: "Our Mission",
      content: (
        <p className="text-gray-800 text-lg">To <b>empower businesses of every size</b> — from large distributors to small warungs and kiosks — by giving them tools to trade smarter, faster, and more profitably.</p>
      ),
    },
    {
      title: "Our Vision",
      content: (
        <p className="text-gray-800 text-lg">A future where every retailer in Indonesia, no matter how small, has <b>equal access to products, prices, and opportunities</b>, and every distributor can <b>reach new markets effortlessly</b>.</p>
      ),
    },
    {
      title: "What We Believe",
      content: (
        <div className="flex flex-col gap-2 text-gray-800 text-lg font-semibold">
          <div>Technology should empower, not complicate.</div>
          <div>Small businesses deserve big opportunities.</div>
          <div>Fair trade grows stronger communities.</div>
        </div>
      ),
    },
    {
      title: "Why “Laku-Laku”?",
      content: (
        <p className="text-gray-800 text-lg">In Indonesian, <i>laku</i> means “to sell” or “to move.”<br />Laku-Laku is about creating momentum — helping products move, helping businesses grow, and helping trade thrive.</p>
      ),
    },
  ];
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative pt-16 pb-20 bg-gradient-to-br from-blue-50 via-white to-orange-50 overflow-hidden animate-fade-in">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="flex flex-col items-center mb-8">
            <span className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4 animate-scale-in" style={{ animationDelay: '0.1s' }}>
              <BookOpenIcon className="text-[#0a61d7] w-8 h-8" />
            </span>
            <h1 className="text-5xl font-bold text-gray-900 mb-4 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              Our Story: Why We Built Laku-Laku
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto animate-fade-in-up animate-delay-200">
              Empowering Indonesia’s distributors and retailers with technology that truly works for them.
            </p>
          </div>
        </div>
        {/* Optional background illustration */}
        <div className="absolute inset-0 pointer-events-none">
          <svg width="100%" height="100%" viewBox="0 0 1440 320" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 left-0 w-full h-64 opacity-20">
            <path fill="#0a61d7" fillOpacity="0.1" d="M0,160L60,170.7C120,181,240,203,360,197.3C480,192,600,160,720,133.3C840,107,960,85,1080,101.3C1200,117,1320,171,1380,197.3L1440,224L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z" />
          </svg>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-lg text-gray-800 space-y-8">
          {[
            "For as long as I can remember, <b>trade has been the lifeblood of local communities</b>. In Indonesia, thousands of distributors, warungs, small shops, and independent retailers play a vital role in keeping daily essentials accessible and affordable. Yet, behind this vibrant economy lies a reality that few outsiders see — <b>the struggle of managing sales, inventory, and orders in a world that is still largely offline, manual, and fragmented</b>.",
            "As I observed how distribution and retail worked, I noticed the same patterns everywhere. Distributors had to juggle spreadsheets for their product listings, rely on countless WhatsApp messages for order-taking, make endless phone calls to confirm payments, and keep manual notes to track stock. Scheduling shipments was a puzzle in itself — no single system could give them clarity over what was coming in, what was going out, and when. This constant switching between disconnected tools created bottlenecks, wasted time, and left plenty of room for costly mistakes.",
            "On the other side of the trade, small retailers — the warungs, kiosks, and mom-and-pop shops that form the backbone of our communities — faced equally daunting challenges. For many of them, securing reliable supply was not easy. They often depended on local distributors or middlemen, leaving them with limited access to product variety and fluctuating prices. They lacked visibility into shipments, and often didn’t know if their orders would arrive on time. For businesses running on tight margins, even the smallest disruption meant lost sales and disappointed customers.",
            "Another challenge I saw was in the way sales happened on the ground. Distributors’ salespeople often had to physically visit retail shops, waiting their turn among a line of other salesmen from different brands or suppliers. This meant that shop owners and buyers were bombarded with product pitches in quick succession, leading to information overload and decision fatigue. Many times, salesmen would have to leave the shop before even getting a chance to present, simply because the buyer was overwhelmed or out of time. This not only wasted effort, but also meant that great products and deals could be missed entirely.",
            "It became clear to me that the problem wasn’t with the people, but with the system. Sales, inventory, and logistics were happening in silos. There was no single platform to bring order to the chaos. And because of this gap, growth was harder than it needed to be. Distributors couldn’t scale efficiently, and retailers couldn’t compete fairly."
          ].map((text, idx) => (
            <p key={idx} className="animate-fade-in-up" style={{ animationDelay: `${0.1 + idx * 0.1}s` }} dangerouslySetInnerHTML={{ __html: text }} />
          ))}
          <blockquote className="border-l-4 border-blue-400 pl-4 italic text-gray-700 bg-blue-50 py-2 rounded animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
            That realization sparked the vision for <b>Laku-Laku</b>.
          </blockquote>
          {[
            "I didn’t set out to build just another B2B marketplace. Instead, I wanted to reimagine how distribution and retail could work if technology truly empowered both sides. Laku-Laku was designed as more than a place to transact. It is a platform where distributors can sell smarter, manage their stock in real-time, schedule and track shipments, and analyze performance — all in one place. At the same time, it gives retailers a simpler, more reliable way to discover products, place orders, and restock with confidence.",
            "The name <b>Laku-Laku</b> itself reflects this spirit. In Indonesian, “laku” means both sale and movement. Trade is all about movement — of goods, of opportunities, of livelihoods. Our platform exists to ensure that this movement happens seamlessly, transparently, and with trust.",
            "What drives me most is the belief that technology should make life easier, not more complicated. Laku-Laku is about bringing modern tools — automation, real-time visibility, and smart data — into a space that has long been underserved. It’s about giving distributors back the time and clarity they need to focus on growth. It’s about giving retailers the access and reliability they deserve to serve their customers better.",
            "Every feature in Laku-Laku comes from this simple vision: to integrate what was once scattered, and to simplify what was once complicated."
          ].map((text, idx) => (
            <p key={idx+4} className="animate-fade-in-up" style={{ animationDelay: `${0.6 + idx * 0.1}s` }} dangerouslySetInnerHTML={{ __html: text }} />
          ))}
          <blockquote className="border-l-4 border-orange-400 pl-4 italic text-gray-700 bg-orange-50 py-2 rounded animate-fade-in-up" style={{ animationDelay: '1.1s' }}>
            We are just at the beginning of this journey, but the mission is clear. Trade in Indonesia, and beyond, deserves a platform built for its unique challenges — one that empowers both sellers and buyers equally. With Laku-Laku, I believe we can create an ecosystem where distribution thrives, retailers grow, and communities benefit.
          </blockquote>
          <p className="animate-fade-in-up" style={{ animationDelay: '1.2s' }}>
            This is not just about building software. It’s about building trust, efficiency, and opportunity for millions of businesses who keep our economy moving every day.
          </p>
          <p className="text-gray-500 text-base animate-fade-in-up" style={{ animationDelay: '1.3s' }}>And this is just the start.</p>
        </div>
      </section>

      {/* Mission, Vision, Belief Section as Carousel */}
      <section className="py-12 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center relative w-full">
            {/* Left Arrow */}
            <button
              className="bg-white rounded-full shadow p-2 hover:bg-blue-50 transition disabled:opacity-30 z-10 mr-10"
              onClick={() => setActiveSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1))}
              aria-label="Previous"
              disabled={slides.length <= 1}
              type="button"
              style={{ minWidth: 44 }}
            >
              <ArrowLeftIcon className="w-6 h-6 text-blue-500" />
            </button>
            {/* Slide Row */}
            <div className="w-full flex justify-center overflow-hidden mb-2" style={{height: 'min-content'}}>
              <div
                className="flex transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(-${activeSlide * 100}%)`, width: `${slides.length * 100}%` }}
              >
                {slides.map((slide, idx) => (
                  <div
                    key={slide.title}
                    className="bg-white rounded-2xl shadow-sm px-8 py-10 border border-gray-100 flex-shrink-0 w-full"
                  >
                    <h2 className="text-2xl font-bold text-blue-900 mb-4 text-center">{slide.title}</h2>
                    <div className="text-center">{slide.content}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* Right Arrow */}
            <button
              className="bg-white rounded-full shadow p-2 hover:bg-blue-50 transition disabled:opacity-30 z-10 ml-10"
              onClick={() => setActiveSlide((prev) => (prev === slides.length - 1 ? 0 : prev + 1))}
              aria-label="Next"
              disabled={slides.length <= 1}
              type="button"
              style={{ minWidth: 44 }}
            >
              <ArrowRightIcon className="w-6 h-6 text-blue-500" />
            </button>
          </div>
          {/* Dots Indicator */}
          <div className="flex justify-center mt-6 gap-2 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            {slides.map((_, idx) => (
              <span
                key={idx}
                className={`inline-block w-3 h-3 rounded-full ${activeSlide === idx ? 'bg-blue-500' : 'bg-gray-300'}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="py-16 bg-gradient-to-r from-[#0a61d7] to-[#084ba6] animate-fade-in-up">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-flex items-center justify-center w-12 h-12 bg-orange-100 rounded-full mb-4 animate-scale-in" style={{ animationDelay: '0.1s' }}>
            <SparklesIcon className="text-orange-500 w-6 h-6" />
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            Join us in building the future of distribution and retail.
          </h2>
          <p className="text-lg text-blue-100 mb-8 max-w-xl mx-auto animate-fade-in-up animate-delay-200">
            At Laku-Laku, we’re not just creating software — we’re shaping a smarter, fairer marketplace for everyone.
          </p>
          <button
            onClick={() => router.push("/landing/solutions")}
            className="bg-orange-500 text-white px-10 py-4 rounded-lg text-lg font-bold hover:bg-orange-600 transition-all duration-200 shadow-xl hover:shadow-orange-500/25 transform hover:-translate-y-1 animate-fade-in-up"
            style={{ animationDelay: '0.3s' }}
          >
            See Our Solutions
          </button>
        </div>
      </section>
    </div>
  );
}
