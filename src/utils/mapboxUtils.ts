export interface MapCoordinates {
  longitude: number;
  latitude: number;
}

export interface GeocodeResult {
  coordinates: MapCoordinates | null;
  address: string;
}

/**
 * Get map marker color based on order status
 * Colors match the UI badge color scheme:
 * - Pending: Yellow (#fbbf24 - yellow-400) matching bg-yellow-100 text-yellow-800
 * - Confirmed: Blue (#3b82f6 - blue-500) matching bg-blue-100 text-blue-800
 * - Packed: Purple (#a855f7 - purple-500) matching bg-purple-100 text-purple-800
 * - Shipped: Indigo (#6366f1 - indigo-500) matching bg-indigo-100 text-indigo-800
 * - Delivered: Green (#22c55e - green-500) matching bg-green-100 text-green-800
 * - Received: Emerald (#10b981 - emerald-500) matching bg-emerald-100 text-emerald-800
 * - Failed: Red (#ef4444 - red-500) matching bg-red-100 text-red-800
 * - Cancelled: Red (#ef4444 - red-500) matching bg-red-100 text-red-800
 * - Returned: Orange (#f97316 - orange-500) matching bg-orange-100 text-orange-800
 */
export function getOrderStatusMarkerColor(status: string): string {
  switch (status) {
    case 'Pending':
      return '#fbbf24'; // Yellow (matches yellow badge)
    case 'Confirmed':
      return '#3b82f6'; // Blue (matches blue badge)
    case 'Packed':
      return '#a855f7'; // Purple (matches purple badge)
    case 'Shipped':
      return '#6366f1'; // Indigo (matches indigo badge)
    case 'Delivered':
      return '#22c55e'; // Green (matches green badge)
    case 'Received':
      return '#10b981'; // Emerald (matches emerald badge)
    case 'Failed':
      return '#ef4444'; // Red (delivery problem)
    case 'Cancelled':
      return '#ef4444'; // Red (matches red badge)
    case 'Returned':
      return '#f97316'; // Orange (matches orange badge)
    default:
      return '#6b7280'; // Gray (default)
  }
}

/**
 * Determine if a color is light or dark for contrast calculation
 */
function isLightColor(color: string): boolean {
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
}

/**
 * Get appropriate text color for a background color
 * Returns white for dark backgrounds, black for light backgrounds
 */
export function getContrastingTextColor(backgroundColor: string): string {
  return isLightColor(backgroundColor) ? '#000000' : '#ffffff';
}

/**
 * Get optimized marker size based on whether it has a label
 */
export function getMarkerSize(hasLabel: boolean): { width: string; height: string } {
  if (hasLabel) {
    return { width: 'auto', height: '32px' };
  }
  return { width: '32px', height: '32px' };
}

/**
 * Get marker container style based on whether it has a label
 */
export function getMarkerContainerStyle(hasLabel: boolean): React.CSSProperties {
  if (hasLabel) {
    return {
      display: 'flex',
      flexDirection: 'row' as const,
      alignItems: 'center',
      gap: '8px',
      background: 'white',
      borderRadius: '30px',
      padding: '4px 8px 4px 4px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      whiteSpace: 'nowrap',
    };
  }
  return {};
}

/**
 * Geocode a single address via the dashboard Google geocoding proxy.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const results = await geocodeViaProxy([address]);
  return results.get(address) ?? { coordinates: null, address };
}

export async function geocodeMultipleAddresses(
  addresses: string[],
): Promise<Map<string, GeocodeResult>> {
  return geocodeViaProxy(addresses);
}

/**
 * Server-side Google geocoding proxy (authenticated dashboard session).
 */
export async function geocodeViaProxy(
  addresses: string[]
): Promise<Map<string, GeocodeResult>> {
  if (addresses.length === 0) return new Map();

  try {
    const res = await fetch('/api/mapbox-geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses }),
      credentials: 'same-origin',
    });

    if (!res.ok) {
      const out = new Map<string, GeocodeResult>();
      addresses.forEach((a) => out.set(a, { coordinates: null, address: a }));
      return out;
    }

    const data = (await res.json()) as {
      results?: Record<string, { coordinates: { longitude: number; latitude: number } | null; address: string }>;
    };
    const results = new Map<string, GeocodeResult>();
    if (data.results) {
      for (const [address, item] of Object.entries(data.results)) {
        results.set(address, {
          coordinates: item.coordinates ?? null,
          address: item.address ?? address,
        });
      }
    }
    addresses.forEach((a) => {
      if (!results.has(a)) results.set(a, { coordinates: null, address: a });
    });
    return results;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('geocodeViaProxy failed:', err);
    }
    const out = new Map<string, GeocodeResult>();
    addresses.forEach((a) => out.set(a, { coordinates: null, address: a }));
    return out;
  }
}

