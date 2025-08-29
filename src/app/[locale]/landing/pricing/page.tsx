'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from "next-intl";
import { usePagePerformanceTracking, createTrackConversion, createErrorBoundary } from '@/utils/landing-enhancements';

const ErrorBoundary = createErrorBoundary('Pricing');

export default function PricingPage() {
  const router = useRouter();
  const t = useTranslations("pricing");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [isAnnual, setIsAnnual] = useState(false);
  
  // Use performance tracking
  usePagePerformanceTracking('Pricing');
  
  // Create conversion tracker
  const trackConversion = createTrackConversion('Pricing');

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  // Use translated pricing tiers from JSON
  const tiers = t.raw('tiers');
  const pricingTiers = tiers.map((tier: any, idx: number) => ({
    name: tier.name,
    monthlyPrice: [
      'Rp 0',
      'Rp 150,000',
      'Rp 500,000',
      'Rp 1,000,000'
    ][idx],
    annualPrice: [
      'Rp 0',
      'Rp 1,705,000',
      'Rp 5,040,000',
      'Rp 10,100,000'
    ][idx],
    description: tier.description,
    features: tier.features,
    buttonText: t('card.getstarted'),
    buttonVariant: idx === 1 ? 'primary' : 'outline',
    commission: tier.commission,
    popular: idx === 1,
    savings: [0, 8, 16, 20][idx]
  }));

  // Use translated comparison table from JSON
  const comparisonFeatures = t.raw('comparison');

  // Use translated FAQ from JSON
  const faqs = Array.from({ length: 7 }, (_, i) => ({
    question: t(`faq.${i + 1}.q`),
    answer: t(`faq.${i + 1}.a`)
  }));

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 animate-fade-in">
      {/* Hero Section */}
      <div className="bg-white py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-5xl font-bold text-gray-900 mb-4 animate-fade-in-up animation-delay-200">
              {t('hero.title')}
            </h1>
            <p className="text-xl text-gray-600 mb-12 animate-fade-in-up animation-delay-400">
              {t('hero.subtitle')}
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-12 inline-block animate-fade-in-up animation-delay-600 hover:scale-105 transition-transform duration-300">
              <p className="text-blue-800 font-medium">
                {t('hero.trial')}
              </p>
            </div>

             {/* Billing Toggle */}
             <div className="flex items-center justify-center mb-8 animate-fade-in-up animation-delay-800">
               <span className={`text-lg font-medium ${!isAnnual ? 'text-gray-900' : 'text-gray-500'} mr-4 transition-colors duration-300`}>
                 {t('toggle.monthly')}
               </span>
               <button
                 onClick={() => setIsAnnual(!isAnnual)}
                 className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 hover:scale-110 ${
                   isAnnual ? 'bg-blue-600' : 'bg-gray-300'
                 }`}
               >
                 <span
                   className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 ${
                     isAnnual ? 'translate-x-7' : 'translate-x-1'
                   }`}
                 />
               </button>
               <span className={`text-lg font-medium ${isAnnual ? 'text-gray-900' : 'text-gray-500'} ml-4 transition-colors duration-300`}>
                 {t('toggle.annual')}
               </span>
               {isAnnual && (
                 <span className="ml-3 bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded-full animate-bounce-in animate-pulse">
                   {t('toggle.save')}
                 </span>
               )}
             </div>
           </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mt-16">
            {pricingTiers.map((tier: any, index: number) => {
               let borderColor = 'border-gray-200';
               if (index === 1) borderColor = 'border-blue-500';
               else if (index === 2) borderColor = 'border-orange-500';
               else if (index === 3) borderColor = 'border-purple-500';
               
               return (
                 <div
                   key={tier.name}
                   className={`relative bg-white rounded-2xl shadow-lg border-2 ${borderColor} p-8 transition-all duration-500 hover:shadow-2xl hover:scale-105 hover:-translate-y-2 animate-fade-in-up`}
                   style={{ animationDelay: `${(index + 1) * 200}ms` }}
                 >
                                 {tier.popular && (
                   <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                     <span className="bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium animate-pulse">
                       {t('card.mostpopular')}
                     </span>
                   </div>
                 )}
                <div className="text-center">
                   <h3 className="text-2xl font-bold text-gray-900 mb-2">{tier.name}</h3>
                   <div className="mb-4">
                     <div className="flex flex-col items-center">
                       <span className="text-2xl font-bold text-gray-900">
                         {isAnnual ? tier.annualPrice : tier.monthlyPrice}
                         <span className="text-gray-600 font-medium text-sm ml-1">
                           {tier.monthlyPrice !== 'Custom' && tier.monthlyPrice !== 'Rp 0' ? (isAnnual ? '/year' : '/month') : ''}
                         </span>
                       </span>
                       {isAnnual && tier.savings > 0 && tier.monthlyPrice !== 'Custom' && tier.monthlyPrice !== 'Rp 0' && (
                         <span className="text-green-600 text-sm font-medium bg-green-50 px-2 py-1 rounded-md mt-1 animate-bounce-in">
                           {t('card.savings', { percent: tier.savings })}
                         </span>
                       )}
                     </div>
                   </div>
                   <p className="text-gray-600 mb-2">{tier.description}</p>
                   <p className="text-sm font-medium text-blue-600 mb-6">{tier.commission}</p>
                 </div>

                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature: any, featureIndex: number) => (
                    <li key={featureIndex} className="flex items-start">
                      <Check className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                                 <button
                   className={`w-full py-3 px-6 rounded-lg font-medium transition-all duration-300 transform hover:scale-105 hover:shadow-lg ${
                     tier.buttonVariant === 'primary'
                       ? 'bg-[#0a61d7] text-white hover:bg-[#084ba6] hover:shadow-blue-500/25'
                       : 'bg-white-100 text-blue-600 hover:bg-blue-50 border border-blue-600 hover:shadow-blue-500/25'
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
          <div className="text-center mb-16 animate-fade-in-up">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              {t('comparison.title')}
            </h2>
            <p className="text-xl text-gray-600">
              {t('comparison.subtitle')}
            </p>
          </div>
          <div className="overflow-x-auto bg-white rounded-lg shadow-lg border border-gray-200 animate-fade-in-up animation-delay-400">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                    {t('comparison.plan.free')}
                  </th>
                  <th className="px-6 py-4 text-center">
                    <div className="text-blue-600 text-lg font-medium mb-1">{t('comparison.plan.starter')}</div>
                    <div className="text-gray-900 text-xl font-bold mb-1">{isAnnual ? 'Rp 1,705,000' : 'Rp 150,000'} <span className="text-gray-600 font-medium text-sm">{isAnnual ? '/year' : '/month'}</span></div>
                    <button className="border border-blue-600 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-all duration-300 hover:scale-105 hover:shadow-lg">
                      {t('card.getstarted')}
                    </button>
                  </th>
                  <th className="px-6 py-4 text-center">
                    <div className="text-blue-600 text-lg font-medium mb-1">{t('comparison.plan.business')}</div>
                    <div className="text-gray-900 text-xl font-bold mb-1">
                      {isAnnual ? 'Rp 5,040,000' : 'Rp 500,000'} <span className="text-gray-600 font-medium text-sm">{isAnnual ? '/year' : '/month'}</span>
                    </div>
                    <button className="bg-[#0a61d7] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#084ba6] transition-all duration-300 hover:scale-105 hover:shadow-lg">
                      {t('card.getstarted')}
                    </button>
                  </th>
                  <th className="px-6 py-4 text-center">
                    <div className="text-orange-600 text-lg font-medium mb-1">{t('comparison.plan.enterprise')}</div>
                    <div className="text-gray-900 text-xl font-bold mb-1">
                      {isAnnual ? 'Rp 10,100,000' : 'Rp 1,000,000'} <span className="text-gray-600 font-medium text-sm">{isAnnual ? '/year' : '/month'}</span>
                    </div>
                    <button className="border border-blue-600 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-all duration-300 hover:scale-105 hover:shadow-lg">
                      {t('card.getstarted')}
                    </button>
                  </th>
                  <th className="px-6 py-4 text-center">
                    <div className="text-purple-600 text-lg font-medium mb-1">Unlimited+</div>
                    <div className="text-gray-900 text-xl font-bold mb-1">
                      {isAnnual ? 'Rp 10,100,000' : 'Rp 1,000,000'} <span className="text-gray-600 font-medium text-sm">{isAnnual ? '/year' : '/month'}</span>
                    </div>
                    <button className="border border-blue-600 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-all duration-300 hover:scale-105 hover:shadow-lg">
                      Get Started
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {comparisonFeatures.features.map((row: any, index: number) => (
                  <tr key={index} className="hover:bg-gray-50 transition-colors duration-200">
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
          <div className="text-center mb-16 animate-fade-in-up">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              {t('faq.title')}
            </h2>
            <p className="text-xl text-gray-600">
              {t('faq.subtitle')}
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="bg-white rounded-lg shadow-md border border-gray-200 animate-fade-in-up hover:shadow-lg transition-all duration-300"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <button
                  className="w-full px-6 py-4 text-left flex justify-between items-center hover:bg-gray-50 rounded-lg transition-all duration-300"
                  onClick={() => toggleFaq(index)}
                >
                  <h3 className="text-lg font-bold text-gray-900 pr-4">
                    {faq.question}
                  </h3>
                  {openFaq === index ? (
                    <ChevronUp className="h-5 w-5 text-gray-500 flex-shrink-0 transition-transform duration-300 rotate-180" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-500 flex-shrink-0 transition-transform duration-300" />
                  )}
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-4 mt-4 animate-fade-in-down">
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
      <div className="bg-gradient-to-r from-[#0a61d7] to-[#084ba6] py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4 animate-fade-in-up">
            {t('cta.title')}
          </h2>
          <p className="text-xl text-blue-100 mb-8 animate-fade-in-up animation-delay-200">
            {t('cta.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up animation-delay-400">
            <button 
              onClick={() => {
                trackConversion('cta_click', 'free_trial');
                router.push('/register');
              }}
              className="bg-orange-500 text-white px-10 py-4 rounded-lg text-md font-bold hover:bg-orange-600 transition-all duration-300 shadow-2xl hover:shadow-orange-500/25 transform hover:-translate-y-2 hover:scale-105"
              aria-label="Start free trial">
              {t('cta.trial')}
            </button>
            <button className="bg-white text-blue-600 px-10 py-4 rounded-lg text-md font-medium hover:bg-gray-100 transition-all duration-300 shadow-2xl hover:shadow-blue-500/25 transform hover:-translate-y-2 hover:scale-105">
              {t('cta.contact')}
            </button>
          </div>
        </div>
      </div>
      </div>
    </ErrorBoundary>
  );
}
