'use client';

import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';

import './leaflet.css';

function logoMarkerIcon(src) {
  const safeSrc = String(src || '');
  if (!safeSrc) {
    return L.divIcon({
      className: 'dealer-pin',
      html: `<div style="width:16px;height:16px;border-radius:999px;border:2px solid rgba(15,23,42,.55);background:rgba(59,130,246,.85);box-shadow:0 8px 18px rgba(15,23,42,.18)"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
  }

  return L.divIcon({
    className: '',
    html: `
      <div style="
        width: 32px; height: 32px; border-radius: 999px;
        background: rgba(255,255,255,0.95);
        border: 2px solid rgba(15,23,42,.65);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 8px 22px rgba(15,23,42,.18);
      ">
        <img src="${safeSrc}" alt="" style="width: 18px; height: 18px; object-fit: contain;" />
      </div>
    `.trim(),
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });
}

export default function DealerMiniMapLeaflet({ lat, lng, iconSrc, height = 200 }) {
  const center = useMemo(() => [lat, lng], [lat, lng]);
  const icon = useMemo(() => logoMarkerIcon(iconSrc), [iconSrc]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return (
    <div style={{ height, width: '100%', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(15,23,42,.10)' }}>
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={center} icon={icon} />
      </MapContainer>
    </div>
  );
}
