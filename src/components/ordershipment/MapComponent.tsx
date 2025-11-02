'use client';
import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { MapCoordinates, getMarkerSize, getMarkerContainerStyle } from '@/utils/mapboxUtils';

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
      map.current.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
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
        
        const hasLabel = !!markerData.label;
        const markerSize = getMarkerSize(hasLabel);
        const containerStyle = getMarkerContainerStyle(hasLabel);
        
        el.style.width = markerSize.width;
        el.style.height = markerSize.height;
        el.style.cursor = 'pointer';
        
        if (hasLabel) {
          Object.assign(el.style, containerStyle);
          el.innerHTML = `
            <div style="width: 32px; height: 32px; border-radius: 50%; background-color: ${markerData.color || '#0a61d7'}; border: 3px solid white; flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>
            <span style="color: #000000; font-size: 11px; font-weight: bold; white-space: nowrap; margin-left: 0;">${markerData.label}</span>
          `;
        } else {
          el.style.borderRadius = '50%';
          el.style.backgroundColor = markerData.color || '#0a61d7';
          el.style.border = '3px solid white';
          el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
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

