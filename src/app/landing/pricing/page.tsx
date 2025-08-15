'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function PricingPage() {
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [isAnnual, setIsAnnual] = useState(false);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const pricingTiers = [
    {
      name: 'Free',
      monthlyPrice: 'Rp 0',
      annualPrice: 'Rp 0',
      description: 'Perfect for getting started',
      features: [
        '50 SKUs Marketplace Listing',
        'Basic Transaction Analytics',
        'Basic Seller Dashboard',
        'Manual Order Entry',
        'Email Customer Support',
        'Basic Coupons Marketing',
        '7 days Payment Settlement',
        '1 Warehouse Support',
        '1 Staff Account'
      ],
      buttonText: 'Get Started',
      buttonVariant: 'outline',
      commission: '3% commission fee',
      popular: false,
      savings: 0
    },
    {
      name: 'Starter',
      monthlyPrice: 'Rp 150,000',
      annualPrice: 'Rp 1,705,000',
      description: 'For small sellers testing the platform',
      features: [
        '200 SKUs Marketplace Listing',
        'Standard Transaction Analytics',
        'Standard Seller Dashboard',
        'Bulk Upload Order Management',
        'Email & Chat Support',
        'Coupons + Discounts',
        '5 days Payment Settlement',
        '1 Warehouse Support',
        '5 Staff Accounts'
      ],
      buttonText: 'Get Started',
      buttonVariant: 'primary',
      commission: '2% commission fee',
      popular: true,
      savings: 8
    },
    {
      name: 'Business',
      monthlyPrice: 'Rp 500,000',
      annualPrice: 'Rp 5,040,000',
      description: 'For growing sellers with consistent volume',
      features: [
        '1,000 SKUs Marketplace Listing',
        'Advanced Transaction Analytics',
        'Premium Seller Dashboard',
        'Bulk Upload + Auto Sync',
        'Priority Chat Support',
        'Campaigns + Ads Marketing',
        '3 days Payment Settlement',
        '3 Warehouses Support',
        '15 Staff Accounts',
        'Custom Branding Available'
      ],
      buttonText: 'Get Started',
      buttonVariant: 'outline',
      commission: '1% commission fee',
      popular: false,
      savings: 16
    },
    {
      name: 'Enterprise',
      monthlyPrice: 'Rp 1,000,000',
      annualPrice: 'Rp 10,100,000',
      description: 'For top-tier partners, incentivizing loyalty',
      features: [
        'Unlimited Marketplace Listing',
        'Advanced + Custom Reports',
        'Premium + API Access Dashboard',
        'Full API Integration',
        'Dedicated Manager Support',
        'Custom Campaign Support',
        'Instant/Custom Settlement',
        'Unlimited Warehouses',
        'Unlimited Staff Accounts',
        'Fully Branded Experience'
      ],
      buttonText: 'Get Started',
      buttonVariant: 'outline',
      commission: '0.5% commission fee',
      popular: false,
      savings: 20
    }
  ];

  const comparisonFeatures = [
    { feature: 'Marketplace Listing', free: '50 SKUs', starter: '200 SKUs', business: '1,000 SKUs', enterprise: 'Unlimited' },
    { feature: 'Transaction Analytics', free: 'Basic', starter: 'Standard', business: 'Advanced', enterprise: 'Advanced + Custom Reports' },
    { feature: 'Seller Dashboard', free: 'Basic', starter: 'Standard', business: 'Premium', enterprise: 'Premium + API Access' },
    { feature: 'Order Management', free: 'Manual Entry', starter: 'Bulk Upload', business: 'Bulk Upload + Auto Sync', enterprise: 'Full API Integration' },
    { feature: 'Customer Support', free: 'Email', starter: 'Email & Chat', business: 'Priority Chat', enterprise: 'Dedicated Manager' },
    { feature: 'Marketing Tools', free: 'Basic Coupons', starter: 'Coupons + Discounts', business: 'Campaigns + Ads', enterprise: 'Custom Campaign Support' },
    { feature: 'Payment Settlement', free: '5 days', starter: '3 days', business: '1-2 days', enterprise: 'Instant/Custom' },
    { feature: 'Multi-Warehouse Support', free: '1 Warehouse', starter: '1 Warehouse', business: '3 Warehouses', enterprise: 'Unlimited' },
    { feature: 'Staff Accounts', free: '1', starter: '7', business: '15', enterprise: 'Unlimited' },
    { feature: 'Custom Branding', free: '-', starter: '-', business: 'Available', enterprise: 'Fully Branded' }
  ];

  const faqs = [
    {
      question: 'Do I need to pay both the monthly fee and commission?',
      answer: 'Yes, Laku-Laku uses a dual monetization model. The monthly fee covers SaaS features, and the commission is applied per transaction to keep our marketplace growing.'
    },
         {
       question: 'Is there a free trial?',
       answer: 'Yes, Starter and Business plans include a 14-day free trial with no credit card required.'
     },
     {
       question: 'What are the benefits of annual billing?',
       answer: 'Annual billing offers significant savings: 10% off Starter plan, 16% off Business plan, and 8% off Enterprise plan. You also get the convenience of paying once per year.'
     },
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept bank transfer (BCA, Mandiri, BRI), virtual accounts, and credit/debit cards.'
    },
    {
      question: 'Can I upgrade or downgrade my plan anytime?',
      answer: 'Yes, you can switch plans at the end of your billing cycle with no penalties.'
    },
    {
      question: 'How are commissions calculated?',
      answer: 'Commissions are calculated as a percentage of the order value (excluding shipping).'
    },
    {
      question: 'Does Enterprise include integrations with my ERP/WMS?',
      answer: 'Yes, Enterprise sellers get full API access and onboarding support for system integrations.'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-white py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-5xl font-bold text-gray-900 mb-4">
              Simple & Predictable Pricing
            </h1>
            <p className="text-xl text-gray-600 mb-12">
              No Surprises. Choose the plan that fits your business needs.
            </p>
                         <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-12 inline-block">
               <p className="text-blue-800 font-medium">
                 14-day free trial. No credit card required.
               </p>
             </div>

             {/* Billing Toggle */}
             <div className="flex items-center justify-center mb-8">
               <span className={`text-lg font-medium ${!isAnnual ? 'text-gray-900' : 'text-gray-500'} mr-4`}>
                 Monthly
               </span>
               <button
                 onClick={() => setIsAnnual(!isAnnual)}
                 className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                   isAnnual ? 'bg-blue-600' : 'bg-gray-300'
                 }`}
               >
                 <span
                   className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                     isAnnual ? 'translate-x-7' : 'translate-x-1'
                   }`}
                 />
               </button>
               <span className={`text-lg font-medium ${isAnnual ? 'text-gray-900' : 'text-gray-500'} ml-4`}>
                 Annual
               </span>
               {isAnnual && (
                 <span className="ml-3 bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded-full">
                   Save up to 20%
                 </span>
               )}
             </div>
           </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mt-16">
                         {pricingTiers.map((tier, index) => {
               let borderColor = 'border-gray-200';
               if (tier.name === 'Starter') borderColor = 'border-blue-500';
               else if (tier.name === 'Business') borderColor = 'border-orange-500';
               else if (tier.name === 'Enterprise') borderColor = 'border-purple-500';
               
               return (
                 <div
                   key={tier.name}
                   className={`relative bg-white rounded-2xl shadow-lg border-2 ${borderColor} p-8 transition-all duration-300 hover:shadow-xl`}
                 >
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium">
                      Most Popular
                    </span>
                  </div>
                )}
                <div className="text-center">
                   <h3 className="text-2xl font-bold text-gray-900 mb-2">{tier.name}</h3>
                   <div className="mb-4">
                     <div className="flex flex-col items-center">
                       <span className="text-2xl font-bold text-gray-900">
                         {isAnnual ? tier.annualPrice : tier.monthlyPrice}
                       </span>
                       <span className="text-gray-600 text-sm">
                         {tier.monthlyPrice !== 'Custom' && tier.monthlyPrice !== 'Rp 0' ? (isAnnual ? '/year (billed annually)' : '/month') : ''}
                       </span>
                       {isAnnual && tier.savings > 0 && tier.monthlyPrice !== 'Custom' && tier.monthlyPrice !== 'Rp 0' && (
                         <span className="text-green-600 text-sm font-medium bg-green-50 px-2 py-1 rounded-md mt-1">
                           Save {tier.savings}%
                         </span>
                       )}
                     </div>
                   </div>
                   <p className="text-gray-600 mb-2">{tier.description}</p>
                   <p className="text-sm font-medium text-blue-600 mb-6">{tier.commission}</p>
                 </div>

                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start">
                      <Check className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
                    tier.buttonVariant === 'primary'
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-white-100 text-blue-600 hover:bg-blue-50 border border-blue-600'
                  }`}
                >
                  {tier.buttonText}
                                 </button>
               </div>
             );
           })}
          </div>
        </div>
      </div>

      {/* Feature Comparison Table */}
      <div className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Compare All Features
            </h2>
            <p className="text-xl text-gray-600">
              Detailed comparison of features across all plans
            </p>
          </div>
          <div className="overflow-x-auto bg-white rounded-lg shadow-lg border border-gray-200">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Compare Plans
                  </th>
                  <th className="px-6 py-4 text-center">
                    <div className="text-blue-600 text-lg font-medium mb-1">Pro</div>
                    <div className="text-gray-900 text-xl font-bold mb-1">Rp 0</div>
                    <div className="text-gray-600 text-sm mb-3">/month</div>
                    <button className="border border-blue-600 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors">
                      Get Started
                    </button>
                  </th>
                  <th className="px-6 py-4 text-center">
                    <div className="text-blue-600 text-lg font-medium mb-1">Business</div>
                    <div className="text-gray-900 text-xl font-bold mb-1">
                      {isAnnual ? 'Rp 1,705,000' : 'Rp 150,000'}
                    </div>
                    <div className="text-gray-600 text-sm mb-3">
                      {isAnnual ? '/year' : '/month'}
                    </div>
                    <button className="border border-blue-600 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors">
                      Get Started
                    </button>
                  </th>
                  <th className="px-6 py-4 text-center">
                    <div className="text-orange-600 text-lg font-medium mb-1">Enterprise</div>
                    <div className="text-gray-900 text-xl font-bold mb-1">
                      {isAnnual ? 'Rp 5,040,000' : 'Rp 500,000'}
                    </div>
                    <div className="text-gray-600 text-sm mb-3">
                      {isAnnual ? '/year' : '/month'}
                    </div>
                    <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                      Get Started
                    </button>
                  </th>
                  <th className="px-6 py-4 text-center">
                    <div className="text-purple-600 text-lg font-medium mb-1">Unlimited+</div>
                    <div className="text-gray-900 text-xl font-bold mb-1">
                      {isAnnual ? 'Rp 10,100,000' : 'Rp 1,000,000'}
                    </div>
                    <div className="text-gray-600 text-sm mb-3">
                      {isAnnual ? '/year' : '/month'}
                    </div>
                    <button className="border border-blue-600 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors">
                      Get Started
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {comparisonFeatures.map((row, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {row.feature}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-center">
                      {row.free === '-' ? (
                        <span className="text-gray-400">-</span>
                      ) : (
                        row.free
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-center">
                      {row.starter === '-' ? (
                        <span className="text-gray-400">-</span>
                      ) : (
                        row.starter
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-center">
                      {row.business === '-' ? (
                        <span className="text-gray-400">-</span>
                      ) : (
                        row.business
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-center">
                      {row.enterprise}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="bg-gray-50 py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-xl text-gray-600">
              Everything you need to know about our pricing
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="bg-white rounded-lg shadow-md border border-gray-200"
              >
                <button
                  className="w-full px-6 py-4 text-left flex justify-between items-center hover:bg-gray-50 rounded-lg transition-colors"
                  onClick={() => toggleFaq(index)}
                >
                  <h3 className="text-lg font-bold text-gray-900 pr-4">
                    {faq.question}
                  </h3>
                  {openFaq === index ? (
                    <ChevronUp className="h-5 w-5 text-gray-500 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-500 flex-shrink-0" />
                  )}
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-4">
                    <p className="text-gray-700 leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-blue-600 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to get started?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join thousands of sellers growing their business with Laku-Laku
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              onClick={() => router.push('/register')}
              className="bg-orange-500 text-white px-10 py-4 rounded-lg text-md font-bold hover:bg-orange-600 transition-all duration-200 shadow-2xl hover:shadow-orange-500/25 transform hover:-translate-y-1 animate-fade-in-up">
              Start Free Trial
            </button>
            <button className="bg-white text-blue-600 px-10 py-4 rounded-lg text-md font-medium hover:bg-gray-100 transition-all duration-200 shadow-2xl hover:shadow-orange-500/25 transform hover:-translate-y-1 animate-fade-in-up">
              Contact Sales
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
