'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

function markerIcon(hasBacklog) {
  return L.divIcon({
    className: 'dealer-pin',
    html: `<div style="width:16px;height:16px;border-radius:999px;border:2px solid rgba(15,23,42,.55);background:${hasBacklog ? 'rgba(239,68,68,.9)' : 'rgba(59,130,246,.85)'};box-shadow:0 8px 18px rgba(15,23,42,.18)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

function BoundsTracker({ onBounds }) {
  useMapEvents({
    moveend: (e) => {
      const b = e.target.getBounds();
      onBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    },
    zoomend: (e) => {
      const b = e.target.getBounds();
      onBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    }
  });
  return null;
}

function FitToMarkers({ markers }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const pts = (markers || []).slice(0, 2000).map((m) => [m.lat, m.lng]);
    if (!pts.length) return;
    const b = L.latLngBounds(pts);
    map.fitBounds(b.pad(0.12));
  }, [map, markers]);

  return null;
}

export default function DealersMapLeaflet({ markers, brands, onBounds, height = 520 }) {
  const center = useMemo(() => {
    // Germany-ish fallback
    return [51.163, 10.447];
  }, []);

  const mIconByKey = brands?.mIconByKey;
  const bgIconByKey = brands?.bgIconByKey;

  function Logo({ src, alt }) {
    if (!src) return null;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt || ''} src={src} style={{ width: 18, height: 18, objectFit: 'contain' }} />;
  }

  return (
    <div className="card" style={{ padding: 10 }}>
      <div style={{ height, width: '100%', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(15,23,42,.10)' }}>
        <MapContainer center={center} zoom={6} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <BoundsTracker onBounds={onBounds} />
          <FitToMarkers markers={markers} />

          {(markers || []).slice(0, 5000).map((m) => (
            <Marker key={m.id} position={[m.lat, m.lng]} icon={markerIcon(m.hasBacklog)}>
              <Popup>
                <div style={{ display: 'grid', gap: 6, minWidth: 180 }}>
                  <div style={{ fontWeight: 900 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: '#667085' }}>{[m.zip, m.city].filter(Boolean).join(' ')}</div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      {(m.manufacturer_keys || []).slice(0, 8).map((k) => (
                        <Logo key={k} src={mIconByKey?.get?.(String(k).toLowerCase())} alt={k} />
                      ))}
                    </div>
                    {m.buying_group_key ? (
                      <Logo src={bgIconByKey?.get?.(String(m.buying_group_key).toLowerCase())} alt={m.buying_group_key} />
                    ) : null}
                  </div>

                  <a className="secondary" href={`/dealers/${m.id}`} style={{ textDecoration: 'none', padding: '8px 10px', fontSize: 12, display: 'inline-flex', width: 'fit-content' }}>
                    Händler öffnen
                  </a>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Tipp: Rein-/Rauszoomen oder Karte verschieben – die Liste darunter zeigt nur Händler im aktuellen Ausschnitt.
      </div>
    </div>
  );
}
