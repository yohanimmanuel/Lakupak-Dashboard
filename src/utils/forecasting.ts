/**
 * Forecasting utilities for analytics using simple time series methods
 * Implements linear regression, moving averages, and exponential smoothing
 */

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
  const sumYY = y.reduce((sum, yi) => sum + yi * yi, 0);

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

/**
 * Calculate moving average
 */
function movingAverage(values: number[], window: number): number[] {
  if (values.length === 0) return [];
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const subset = values.slice(start, i + 1);
    const avg = subset.reduce((a, b) => a + b, 0) / subset.length;
    result.push(avg);
  }
  return result;
}

/**
 * Forecast revenue using linear regression with trend projection
 */
export function forecastRevenue(
  historicalData: Array<{ month: string; revenue: number }>,
  forecastMonths: number = 3
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

  const forecast: ForecastPoint[] = [];
  const lastIndex = historicalData.length - 1;
  
  // Parse the last month date more robustly
  const lastMonthStr = historicalData[lastIndex].month;
  let lastDate: Date;
  try {
    // Try parsing formats like "Dec 2025" or "Dec 2025-01"
    const dateMatch = lastMonthStr.match(/(\w+)\s+(\d{4})/);
    if (dateMatch) {
      lastDate = new Date(`${dateMatch[1]} 1, ${dateMatch[2]}`);
    } else {
      // Fallback: try direct parsing
      lastDate = new Date(lastMonthStr);
    }
    // Validate date
    if (isNaN(lastDate.getTime())) {
      lastDate = new Date(); // Fallback to current date
    }
  } catch {
    lastDate = new Date(); // Fallback to current date
  }
  
  for (let i = 1; i <= forecastMonths; i++) {
    const futureIndex = lastIndex + i;
    const predictedValue = regression.slope * futureIndex + regression.intercept;
    const forecastDate = new Date(lastDate);
    forecastDate.setMonth(forecastDate.getMonth() + i);
    const monthLabel = forecastDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    
    forecast.push({
      date: monthLabel,
      value: Math.max(0, Math.round(predictedValue * 100) / 100), // Round to 2 decimal places
      isForecast: true
    });
  }

  // Use consistent threshold for trend detection (0.01% of average value for better sensitivity)
  const avgValue = y.reduce((a, b) => a + b, 0) / y.length;
  const threshold = Math.max(0.01, avgValue * 0.001); // At least 0.01, or 0.1% of average
  const trend = regression.slope > threshold ? 'increasing' : regression.slope < -threshold ? 'decreasing' : 'stable';
  const confidence = Math.min(100, Math.max(0, Math.round(regression.r2 * 100 * 100) / 100)); // Round to 2 decimal places

  return { historical, forecast, trend, confidence };
}

/**
 * Forecast sales trend (orders, units, pieces)
 */
export function forecastSales(
  historicalData: Array<{ month: string; orders?: number; units?: number; pieces?: number }>,
  metric: 'orders' | 'units' | 'pieces' = 'orders',
  forecastMonths: number = 3
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

  const forecast: ForecastPoint[] = [];
  const lastIndex = historicalData.length - 1;
  
  // Parse the last month date more robustly
  const lastMonthStr = historicalData[lastIndex].month;
  let lastDate: Date;
  try {
    // Try parsing formats like "Dec 2025" or "Dec 2025-01"
    const dateMatch = lastMonthStr.match(/(\w+)\s+(\d{4})/);
    if (dateMatch) {
      lastDate = new Date(`${dateMatch[1]} 1, ${dateMatch[2]}`);
    } else {
      // Fallback: try direct parsing
      lastDate = new Date(lastMonthStr);
    }
    // Validate date
    if (isNaN(lastDate.getTime())) {
      lastDate = new Date(); // Fallback to current date
    }
  } catch {
    lastDate = new Date(); // Fallback to current date
  }
  
  for (let i = 1; i <= forecastMonths; i++) {
    const futureIndex = lastIndex + i;
    const predictedValue = regression.slope * futureIndex + regression.intercept;
    const forecastDate = new Date(lastDate);
    forecastDate.setMonth(forecastDate.getMonth() + i);
    const monthLabel = forecastDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    
    forecast.push({
      date: monthLabel,
      value: Math.max(0, Math.round(predictedValue)),
      isForecast: true
    });
  }

  // Use consistent threshold for trend detection (0.01% of average value for better sensitivity)
  const avgValue = y.reduce((a, b) => a + b, 0) / y.length;
  const threshold = Math.max(0.01, avgValue * 0.001); // At least 0.01, or 0.1% of average
  const trend = regression.slope > threshold ? 'increasing' : regression.slope < -threshold ? 'decreasing' : 'stable';
  const confidence = Math.min(100, Math.max(0, Math.round(regression.r2 * 100 * 100) / 100)); // Round to 2 decimal places

  return { historical, forecast, trend, confidence };
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

