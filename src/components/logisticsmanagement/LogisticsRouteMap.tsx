'use client';

/**
 * LogisticsRouteMap — Mapbox map for logistics.
 *
 * Routing uses only:
 * - Driver live GPS (optional): first waypoint + blue dot
 * - Buyer delivery addresses from assigned orders: geocoded stops + line (pending stops only)
 *
 * Fleet `route` text (e.g. "Jakarta → Semarang") is display-only elsewhere — never used here.
 */

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapboxToken } from '@/hooks/useMapboxToken';
import { useLogisticsTranslations } from '@/hooks/useLogisticsTranslations';

function createDriverDotElement(ariaLabel: string): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('aria-label', ariaLabel);
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

function createStopPinElement(
  index: number,
  isCompleted: boolean,
  stopLabel: string,
  stopCompletedLabel: string,
): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('aria-label', isCompleted ? stopCompletedLabel : stopLabel);
  if (isCompleted) {
    Object.assign(el.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '28px',
      height: '28px',
      borderRadius: '50%',
      backgroundColor: '#10b981',
      color: '#ffffff',
      fontSize: '14px',
      fontWeight: '700',
      border: '2px solid #ffffff',
      boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
      pointerEvents: 'auto',
    });
    el.textContent = '✓';
  } else {
    el.className =
      'flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500 text-white text-xs font-bold border-2 border-white shadow';
    el.textContent = String(index + 1);
  }
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

async function geocodePlace(token: string, query: string): Promise<[number, number] | null> {
  if (!token || !query.trim()) return null;
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json` +
        `?access_token=${token}&limit=1`
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
  token: string,
  waypoints: [number, number][]
): Promise<GeoJSON.Geometry | null> {
  if (!token || waypoints.length < 2) return null;
  try {
    const coords = waypoints.map((w) => w.join(',')).join(';');
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
        `?access_token=${token}&geometries=geojson&overview=full&steps=false`
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
  /** Per-stop completion aligned with deliveryAddresses (Delivered or Received). */
  stopsCompleted?: boolean[];
  driverLat?: number | null;
  driverLng?: number | null;
  height?: string;
  className?: string;
}

export default function LogisticsRouteMap({
  deliveryAddresses,
  stopsCompleted,
  driverLat,
  driverLng,
  height = '415px',
  className,
}: LogisticsRouteMapProps) {
  const { tRouteMap } = useLogisticsTranslations();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const { token, isLoading: tokenLoading } = useMapboxToken();

  const addressKey = deliveryAddresses.join('|');
  const completionKey = (stopsCompleted ?? []).map((c) => (c ? '1' : '0')).join('');
  const driverCoord =
    typeof driverLat === 'number' && typeof driverLng === 'number'
      ? ([driverLng, driverLat] as [number, number])
      : null;

  useEffect(() => {
    if (tokenLoading) return;
    if (!containerRef.current) return;

    if (!token) {
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
    let resizeObserver: ResizeObserver | null = null;
    let cancelled = false;

    (async () => {
      const stopCoords = await Promise.all(deliveryAddresses.map((addr) => geocodePlace(token, addr)));

      const stopPairs = deliveryAddresses
        .map((addr, i) => ({
          addr,
          coord: stopCoords[i],
          isCompleted: stopsCompleted?.[i] === true,
        }))
        .filter(
          (p): p is { addr: string; coord: [number, number]; isCompleted: boolean } => p.coord !== null
        );

      if (cancelled) return;

      if (stopPairs.length === 0) {
        setIsLoading(false);
        setHasError(true);
        return;
      }

      const validStops = stopPairs.map((p) => p.coord);
      const pendingStops = stopPairs.filter((p) => !p.isCompleted).map((p) => p.coord);
      const allWaypoints: [number, number][] = driverCoord ? [driverCoord, ...validStops] : [...validStops];
      const routeWaypoints: [number, number][] = driverCoord
        ? pendingStops.length
          ? [driverCoord, ...pendingStops]
          : []
        : [...pendingStops];

      const center = allWaypoints[0];

      mapboxgl.accessToken = token;
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

      if (containerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          map?.resize();
        });
        resizeObserver.observe(containerRef.current);
      }

      map.on('load', async () => {
        if (cancelled || !map) return;

        if (driverCoord) {
          new mapboxgl.Marker({ element: createDriverDotElement(tRouteMap('driverLocation')), anchor: 'center' })
            .setLngLat(driverCoord)
            .setPopup(
              new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(
                `<div style="color:#111827;font-weight:600;">${escapeHtml(tRouteMap('driverLocation'))}</div>`
              )
            )
            .addTo(map);
        }

        stopPairs.forEach((p, i) => {
          new mapboxgl.Marker({
            element: createStopPinElement(
              i,
              p.isCompleted,
              tRouteMap('stop', { index: i + 1 }),
              tRouteMap('stopCompleted', { index: i + 1 }),
            ),
          })
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
        requestAnimationFrame(() => map?.resize());

        if (routeWaypoints.length >= 2) {
          const capped = routeWaypoints.slice(0, 25);
          const geometry = await fetchDrivingRoute(token, capped);
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
      resizeObserver?.disconnect();
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressKey, completionKey, driverLat, driverLng, token, tokenLoading]);

  if (hasError) {
    return (
      <div
        className={`flex items-center justify-center bg-blue-50 text-gray-400 text-sm ${className ?? ''}`}
        style={{ height }}
      >
        {tRouteMap('mapUnavailable')}
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
