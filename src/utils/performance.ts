// Performance monitoring utilities for production

// Type definitions for performance entries
interface PerformanceEntryWithProcessingStart extends PerformanceEntry {
  processingStart: number;
}

interface PerformanceEntryWithValue extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

export const measurePerformance = () => {
  if (typeof window === 'undefined') return;

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'largest-contentful-paint') {
        // LCP measured
        // Track in analytics
        if (window.gtag) {
          window.gtag('event', 'web_vitals', {
            name: 'LCP',
            value: Math.round(entry.startTime),
            event_category: 'Performance'
          });
        }
      }
      
      if (entry.entryType === 'first-input') {
        const fidEntry = entry as PerformanceEntryWithProcessingStart;
        // FID measured
        if (window.gtag) {
          window.gtag('event', 'web_vitals', {
            name: 'FID',
            value: Math.round(fidEntry.processingStart - fidEntry.startTime),
            event_category: 'Performance'
          });
        }
      }
      
      if (entry.entryType === 'layout-shift') {
        const clsEntry = entry as PerformanceEntryWithValue;
        if (!clsEntry.hadRecentInput) {
          // CLS measured
          if (window.gtag) {
            window.gtag('event', 'web_vitals', {
              name: 'CLS',
              value: Math.round(clsEntry.value * 1000),
              event_category: 'Performance'
            });
          }
        }
      }
    }
  });

  // Observe Core Web Vitals
  observer.observe({entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift']});
};

export const preloadImages = (imagePaths: string[]) => {
  if (typeof window === 'undefined') return;
  
  imagePaths.forEach(path => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = path;
    document.head.appendChild(link);
  });
};

export const lazyLoadSection = (sectionId: string, callback: () => void) => {
  if (typeof window === 'undefined') return;
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        callback();
        observer.unobserve(entry.target);
      }
    });
  }, {
    rootMargin: '50px'
  });

  const element = document.getElementById(sectionId);
  if (element) {
    observer.observe(element);
  }
};

export const trackScrollDepth = () => {
  if (typeof window === 'undefined') return;
  
  const depths = [25, 50, 75, 90, 100];
  const tracked: number[] = [];
  
  const handleScroll = () => {
    const scrollTop = window.pageYOffset;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercent = Math.round((scrollTop / docHeight) * 100);
    
    depths.forEach(depth => {
      if (scrollPercent >= depth && !tracked.includes(depth)) {
        tracked.push(depth);
        
        if (window.gtag) {
          window.gtag('event', 'scroll_depth', {
            event_category: 'Engagement',
            event_label: `${depth}%`,
            value: depth
          });
        }
      }
    });
  };
  
  window.addEventListener('scroll', handleScroll, { passive: true });
  
  return () => window.removeEventListener('scroll', handleScroll);
};
