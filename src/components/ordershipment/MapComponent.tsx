'use client';
import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { MapCoordinates } from '@/utils/mapboxUtils';

const MAPBOX_ACCESS_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

interface MapMarker {
  id: string;
  coordinates: MapCoordinates;
  label?: string;
  color?: string;
}

interface MapComponentProps {
  markers?: MapMarker[];
  center?: MapCoordinates;
  zoom?: number;
  height?: string;
  className?: string;
  showControls?: boolean;
  onMarkerClick?: (markerId: string) => void;
}

export default function MapComponent({
  markers = [],
  center,
  zoom = 12,
  height = '400px',
  className = '',
  showControls = true,
  onMarkerClick,
}: MapComponentProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_ACCESS_TOKEN) return;

    if (map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      accessToken: MAPBOX_ACCESS_TOKEN,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: center ? [center.longitude, center.latitude] : [0, 0],
      zoom: zoom,
    });

    map.current.on('load', () => {
      setMapLoaded(true);
    });

    if (showControls) {
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (markers.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();

      markers.forEach((markerData) => {
        const { longitude, latitude } = markerData.coordinates;

        const el = document.createElement('div');
        el.className = 'custom-marker';
        el.style.width = '32px';
        el.style.height = '32px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = markerData.color || '#0a61d7';
        el.style.border = '3px solid white';
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        el.style.cursor = 'pointer';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';

        if (markerData.label) {
          el.innerHTML = `<span style="color: white; font-size: 12px; font-weight: bold;">${markerData.label}</span>`;
        }

        const marker = new mapboxgl.Marker(el)
          .setLngLat([longitude, latitude])
          .addTo(map.current!);

        if (markerData.label) {
          const popup = new mapboxgl.Popup({ offset: 25 }).setText(markerData.label);
          marker.setPopup(popup);
        }

        if (onMarkerClick) {
          el.addEventListener('click', () => {
            onMarkerClick(markerData.id);
          });
        }

        markersRef.current.push(marker);
        bounds.extend([longitude, latitude]);
      });

      if (markers.length > 1) {
        map.current.fitBounds(bounds, {
          padding: { top: 50, bottom: 50, left: 50, right: 50 },
          maxZoom: 15,
        });
      } else if (markers.length === 1) {
        map.current.setCenter([markers[0].coordinates.longitude, markers[0].coordinates.latitude]);
        map.current.setZoom(zoom);
      }
    } else if (center) {
      map.current.setCenter([center.longitude, center.latitude]);
      map.current.setZoom(zoom);
    }
  }, [markers, mapLoaded, center, zoom, onMarkerClick]);

  if (!MAPBOX_ACCESS_TOKEN) {
    return (
      <div
        className={`bg-gray-100 rounded-lg flex items-center justify-center ${className}`}
        style={{ height }}
      >
        <div className="text-center text-gray-500">
          <p className="font-medium">Map unavailable</p>
          <p className="text-sm">Mapbox access token not configured</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={mapContainer}
      className={`rounded-lg overflow-hidden ${className}`}
      style={{ height, width: '100%' }}
    />
  );
}

