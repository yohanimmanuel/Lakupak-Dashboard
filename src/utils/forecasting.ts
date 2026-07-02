/**
 * Forecasting utilities for analytics using simple time series methods
 * Implements linear regression, moving averages, and exponential smoothing
 */

import {
  AnalyticsTimeRange,
  getAnalyticsPeriodBuckets,
  getForecastPeriodBuckets,
  getForecastPeriodCount,
} from '@/utils/analyticsTimeRange';

export interface ForecastPoint {
  date: string;
  value: number;
  isForecast: boolean;
}

export interface ForecastResult {
  historical: ForecastPoint[];
  forecast: ForecastPoint[];
  trend: 'increasing' | 'decreasing' | 'stable';
  confidence: number;
}

/**
 * Simple linear regression for trend analysis
 */
function linearRegression(x: number[], y: number[]): { slope: number; intercept: number; r2: number } {
  const n = x.length;
  if (n === 0 || n !== y.length) return { slope: 0, intercept: 0, r2: 0 };

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

  // Division by zero protection
  const denominator = n * sumXX - sumX * sumX;
  if (Math.abs(denominator) < 1e-10) {
    // All x values are the same - return horizontal line
    return { slope: 0, intercept: sumY / n, r2: 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared with division by zero protection
  const yMean = sumY / n;
  const ssRes = y.reduce((sum, yi, i) => {
    const predicted = slope * x[i] + intercept;
    return sum + Math.pow(yi - predicted, 2);
  }, 0);
  const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
  const r2 = ssTot === 0 ? 0 : Math.max(0, Math.min(1, 1 - (ssRes / ssTot)));

  return { slope, intercept, r2 };
}

function computeConfidence(r2: number): number {
  return Math.min(100, Math.max(0, Math.round(r2 * 1000) / 10));
}

function buildForecastPoints(
  historicalDataLength: number,
  regression: { slope: number; intercept: number },
  forecastPeriods: number,
  timeRange: AnalyticsTimeRange,
  dateLocale: string,
  roundValue: (value: number) => number,
): ForecastPoint[] {
  const rangeBuckets = getAnalyticsPeriodBuckets(timeRange, { locale: dateLocale });
  const anchorEnd =
    rangeBuckets.length > 0 ? rangeBuckets[rangeBuckets.length - 1].end : new Date();
  const forecastBuckets = getForecastPeriodBuckets(
    timeRange,
    anchorEnd,
    forecastPeriods,
    dateLocale,
  );

  const lastIndex = historicalDataLength - 1;
  return forecastBuckets.map((bucket, i) => {
    const futureIndex = lastIndex + i + 1;
    const predictedValue = regression.slope * futureIndex + regression.intercept;
    return {
      date: bucket.label,
      value: roundValue(predictedValue),
      isForecast: true,
    };
  });
}

/**
 * Forecast revenue using linear regression with trend projection
 */
export function forecastRevenue(
  historicalData: Array<{ month: string; revenue: number }>,
  timeRange: AnalyticsTimeRange = '1M',
  dateLocale = 'en-US',
  forecastPeriods: number = getForecastPeriodCount(timeRange),
): ForecastResult {
  if (historicalData.length < 2) {
    return {
      historical: historicalData.map(d => ({ date: d.month, value: d.revenue, isForecast: false })),
      forecast: [],
      trend: 'stable',
      confidence: 0
    };
  }

  const x = historicalData.map((_, i) => i);
  const y = historicalData.map(d => d.revenue);
  const regression = linearRegression(x, y);

  const historical: ForecastPoint[] = historicalData.map(d => ({
    date: d.month,
    value: d.revenue,
    isForecast: false
  }));

  const forecast = buildForecastPoints(
    historicalData.length,
    regression,
    forecastPeriods,
    timeRange,
    dateLocale,
    (value) => Math.max(0, Math.round(value * 100) / 100),
  );

  const avgValue = y.reduce((a, b) => a + b, 0) / y.length;
  const threshold = Math.max(0.01, avgValue * 0.001);
  const trend = regression.slope > threshold ? 'increasing' : regression.slope < -threshold ? 'decreasing' : 'stable';

  return { historical, forecast, trend, confidence: computeConfidence(regression.r2) };
}

/**
 * Forecast sales trend (orders, units, pieces)
 */
export function forecastSales(
  historicalData: Array<{ month: string; orders?: number; units?: number; pieces?: number }>,
  metric: 'orders' | 'units' | 'pieces' = 'orders',
  timeRange: AnalyticsTimeRange = '1M',
  dateLocale = 'en-US',
  forecastPeriods: number = getForecastPeriodCount(timeRange),
): ForecastResult {
  if (historicalData.length < 2) {
    return {
      historical: historicalData.map(d => ({
        date: d.month,
        value: d[metric] || 0,
        isForecast: false
      })),
      forecast: [],
      trend: 'stable',
      confidence: 0
    };
  }

  const x = historicalData.map((_, i) => i);
  const y = historicalData.map(d => d[metric] || 0);
  const regression = linearRegression(x, y);

  const historical: ForecastPoint[] = historicalData.map(d => ({
    date: d.month,
    value: d[metric] || 0,
    isForecast: false
  }));

  const forecast = buildForecastPoints(
    historicalData.length,
    regression,
    forecastPeriods,
    timeRange,
    dateLocale,
    (value) => Math.max(0, Math.round(value)),
  );

  const avgValue = y.reduce((a, b) => a + b, 0) / y.length;
  const threshold = Math.max(0.01, avgValue * 0.001);
  const trend = regression.slope > threshold ? 'increasing' : regression.slope < -threshold ? 'decreasing' : 'stable';

  return { historical, forecast, trend, confidence: computeConfidence(regression.r2) };
}

/**
 * Calculate forecast accuracy metrics (for future ML model evaluation)
 */
export function calculateForecastAccuracy(
  actual: number[],
  predicted: number[]
): { mae: number; mape: number; rmse: number } {
  if (actual.length !== predicted.length || actual.length === 0) {
    return { mae: 0, mape: 0, rmse: 0 };
  }

  let mae = 0;
  let mape = 0;
  let rmse = 0;

  for (let i = 0; i < actual.length; i++) {
    const error = Math.abs(actual[i] - predicted[i]);
    mae += error;
    if (actual[i] !== 0) {
      mape += Math.abs((error / actual[i]) * 100);
    }
    rmse += error * error;
  }

  mae /= actual.length;
  mape /= actual.length;
  rmse = Math.sqrt(rmse / actual.length);

  return { mae, mape, rmse };
}
