// Global analytics types for production tracking
declare global {
  interface Window {
    gtag?: (
      command: 'event' | 'config' | 'consent',
      action: string,
      parameters?: Record<string, unknown>
    ) => void;
    dataLayer?: unknown[];
  }
}

export interface ConversionEvent {
  action: string;
  category: string;
  label?: string;
  value?: number;
  custom_parameter?: unknown;
}

export interface PerformanceMetrics {
  loadTime: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
}

export {};
