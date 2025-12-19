// Common production enhancements for all landing pages
import React, { useEffect, useState } from 'react';
import { measurePerformance, trackScrollDepth } from './performance';

// Performance monitoring hook - reusable across all landing pages
export const usePagePerformanceTracking = (pageName: string) => {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const trackPerformance = () => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navigation) {
          const loadTime = navigation.loadEventEnd - navigation.fetchStart;
          // Page load time tracked
          
          if (window.gtag) {
            window.gtag('event', 'page_load_time', {
              page: pageName.toLowerCase(),
              value: Math.round(loadTime)
            });
          }
        }
      };

      if (document.readyState === 'complete') {
        trackPerformance();
      } else {
        window.addEventListener('load', trackPerformance);
      }
      
      // Also setup core performance tracking
      measurePerformance();
      const cleanup = trackScrollDepth();
      
      return cleanup;
    }
  }, [pageName]);
};

// Conversion tracking utility - reusable across all landing pages
export const createTrackConversion = (pageName: string) => {
  return (action: string, label?: string) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', action, {
        event_category: `${pageName} Page`,
        event_label: label,
        page: pageName.toLowerCase()
      });
    }
    
    if (process.env.NODE_ENV === 'development') {
      // Conversion tracked
    }
  };
};

// Error boundary component - reusable across all landing pages
export const createErrorBoundary = (pageName: string) => {
  const ErrorBoundaryComponent = ({ children }: { children: React.ReactNode }) => {
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
      const handleError = (error: ErrorEvent) => {
        // Error logged
        setHasError(true);
        
        if (window.gtag) {
          window.gtag('event', 'exception', {
            description: error.message,
            fatal: false,
            page: pageName.toLowerCase()
          });
        }
      };

      window.addEventListener('error', handleError);
      return () => window.removeEventListener('error', handleError);
    }, []);

    if (hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Something went wrong</h2>
            <p className="text-gray-600 mb-4">We&apos;re experiencing technical difficulties. Please refresh the page.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="bg-[#0a61d7] text-white px-6 py-2 rounded-lg hover:bg-[#084ba6] transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return <>{children}</>;
  };
  
  ErrorBoundaryComponent.displayName = `${pageName}ErrorBoundary`;
  return ErrorBoundaryComponent;
};

// SEO meta data generator
export const createSEOMetaData = (page: {
  title: string;
  description: string;
  keywords: string;
  locale: string;
  path: string;
  structuredData?: Record<string, unknown>;
}) => {
  return {
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    canonical: `https://laku.com/${page.locale}/landing/${page.path}`,
    ogTitle: page.title,
    ogDescription: page.description,
    ogUrl: `https://laku.com/${page.locale}/landing/${page.path}`,
    twitterTitle: page.title,
    twitterDescription: page.description,
    structuredData: page.structuredData || {}
  };
};
