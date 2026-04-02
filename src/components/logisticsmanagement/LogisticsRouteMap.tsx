'use client';

/**
 * LogisticsRouteMap — Mapbox map for logistics.
 *
 * Routing uses only:
 * - Driver live GPS (optional): first waypoint + blue dot
 * - Buyer delivery addresses from assigned orders: geocoded stops + line
 *
 * Fleet `route` text (e.g. "Jakarta → Semarang") is display-only elsewhere — never used here.
 */

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

function createDriverDotElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('aria-label', 'Driver location');
  Object.assign(el.style, {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    backgroundColor: '#0a61d7',
    border: '3px solid #ffffff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
    pointerEvents: 'auto',
  });
  return el;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function geocodePlace(query: string): Promise<[number, number] | null> {
  if (!TOKEN || !query.trim()) return null;
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json` +
        `?access_token=${TOKEN}&limit=1`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: { geometry: { coordinates: [number, number] } }[];
    };
    return data.features?.[0]?.geometry.coordinates ?? null;
  } catch {
    return null;
  }
}

async function fetchDrivingRoute(
  waypoints: [number, number][]
): Promise<GeoJSON.Geometry | null> {
  if (!TOKEN || waypoints.length < 2) return null;
  try {
    const coords = waypoints.map((w) => w.join(',')).join(';');
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
        `?access_token=${TOKEN}&geometries=geojson&overview=full&steps=false`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: { geometry: GeoJSON.Geometry }[];
    };
    return data.routes?.[0]?.geometry ?? null;
  } catch {
    return null;
  }
}

export interface LogisticsRouteMapProps {
  /** Buyer delivery addresses from assigned orders (only source for stop coordinates). */
  deliveryAddresses: string[];
  driverLat?: number | null;
  driverLng?: number | null;
  height?: string;
  className?: string;
}

export default function LogisticsRouteMap({
  deliveryAddresses,
  driverLat,
  driverLng,
  height = '415px',
  className,
}: LogisticsRouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const addressKey = deliveryAddresses.join('|');
  const driverCoord =
    typeof driverLat === 'number' && typeof driverLng === 'number'
      ? ([driverLng, driverLat] as [number, number])
      : null;

  useEffect(() => {
    if (!containerRef.current) return;

    if (!TOKEN) {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    if (!deliveryAddresses.length) {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    let map: mapboxgl.Map | null = null;
    let cancelled = false;

    (async () => {
      const stopCoords = await Promise.all(deliveryAddresses.map((addr) => geocodePlace(addr)));

      const stopPairs = deliveryAddresses
        .map((addr, i) => ({ addr, coord: stopCoords[i] }))
        .filter((p): p is { addr: string; coord: [number, number] } => p.coord !== null);

      if (cancelled) return;

      if (stopPairs.length === 0) {
        setIsLoading(false);
        setHasError(true);
        return;
      }

      const validStops = stopPairs.map((p) => p.coord);
      const allWaypoints: [number, number][] = driverCoord ? [driverCoord, ...validStops] : [...validStops];

      const center = allWaypoints[0];

      mapboxgl.accessToken = TOKEN;
      map = new mapboxgl.Map({
        container: containerRef.current!,
        style: 'mapbox://styles/mapbox/streets-v12',
        center,
        zoom: allWaypoints.length > 1 ? 6 : 12,
        attributionControl: false,
        logoPosition: 'bottom-right',
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');

      map.on('load', async () => {
        if (cancelled || !map) return;

        if (driverCoord) {
          new mapboxgl.Marker({ element: createDriverDotElement(), anchor: 'center' })
            .setLngLat(driverCoord)
            .setPopup(
              new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(
                `<div style="color:#111827;font-weight:600;">Driver location</div>`
              )
            )
            .addTo(map);
        }

        stopPairs.forEach((p, i) => {
          const el = document.createElement('div');
          el.className =
            'flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500 text-white text-xs font-bold border-2 border-white shadow';
          el.textContent = String(i + 1);
          new mapboxgl.Marker({ element: el })
            .setLngLat(p.coord)
            .setPopup(
              new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(
                `<div style="color:#111827;">${escapeHtml(p.addr)}</div>`
              )
            )
            .addTo(map!);
        });

        if (allWaypoints.length > 1) {
          const bounds = allWaypoints.reduce(
            (b, c) => b.extend(c),
            new mapboxgl.LngLatBounds(allWaypoints[0], allWaypoints[0])
          );
          map.fitBounds(bounds, {
            padding: { top: 60, bottom: 60, left: 60, right: 60 },
            maxZoom: 13,
            duration: 800,
          });
        }

        setIsLoading(false);

        if (allWaypoints.length >= 2) {
          const capped = allWaypoints.slice(0, 25);
          const geometry = await fetchDrivingRoute(capped);
          if (cancelled || !geometry || !map) return;
          map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry, properties: {} } });
          map.addLayer({
            id: 'route-casing',
            type: 'line',
            source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#bfdbfe', 'line-width': 8 },
          });
          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#0a61d7', 'line-width': 4 },
          });
        }
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressKey, driverLat, driverLng]);

  if (hasError) {
    return (
      <div
        className={`flex items-center justify-center bg-blue-50 text-gray-400 text-sm ${className ?? ''}`}
        style={{ height }}
      >
        Map unavailable
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`} style={{ height }}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-50 z-10">
          <div className="w-7 h-7 border-[3px] border-[#0a61d7] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
