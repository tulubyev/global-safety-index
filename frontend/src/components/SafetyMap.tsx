'use client';

import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import { useEffect, useState, useRef } from 'react';
import { Weights } from '@/types/weights';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Props {
  weights: Weights;
  onCountryClick: (code: string) => void;
}

function scoreToColor(score: number | string | null): string {
  if (score === null || score === undefined) return '#d1d5db';
  const s = Number(score);
  if (isNaN(s)) return '#d1d5db';
  // Green (120°) → Yellow (60°) → Red (0°)
  const hue = Math.max(0, 120 - s * 1.2);
  return `hsl(${hue}, 75%, 45%)`;
}

export default function SafetyMap({ weights, onCountryClick }: Props) {
  const [geoData, setGeoData]   = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const geoRef = useRef<any>(null);

  // Load GeoJSON once
  useEffect(() => {
    fetch(`${API}/api/map/all`)
      .then(r => r.json())
      .then(data => { setGeoData(data); setLoading(false); })
      .catch(e => { console.error('[SafetyMap]', e); setLoading(false); });
  }, []);

  // Re-score countries when weights change (client-side, instant)
  useEffect(() => {
    if (!geoRef.current || !geoData) return;
    const total = Object.values(weights).reduce((a: number, b) => a + (b as number), 0) || 1;
    const w = {
      conflict: (weights.conflict as number) / total,
      disaster: (weights.disaster as number) / total,
      food:     (weights.food     as number) / total,
      seismic:  (weights.seismic  as number) / total,
    };

    // Compute raw scores
    const features = geoData.features;
    const rawScores = features.map((f: any) => {
      const p = f.properties;
      return w.conflict * (Number(p.conflict) || 0)
           + w.disaster * (Number(p.disaster) || 0)
           + w.food     * (Number(p.food)     || 0)
           + w.seismic  * (Number(p.seismic)  || 0);
    });

    const minV  = Math.min(...rawScores);
    const maxV  = Math.max(...rawScores);
    const range = maxV - minV || 1;

    // Update each layer's fill color
    geoRef.current.eachLayer((layer: any) => {
      const code = layer.feature?.properties?.code;
      const idx  = features.findIndex((f: any) => f.properties.code === code);
      if (idx < 0) return;
      const score = Math.sqrt((rawScores[idx] - minV) / range) * 100;
      layer.setStyle({ fillColor: scoreToColor(score) });
      layer.feature.properties._score = score.toFixed(1);
      layer.setTooltipContent(`${layer.feature.properties.name}: ${score.toFixed(1)}`);
    });
  }, [weights, geoData]);

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      {loading && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)', zIndex: 1000,
          background: 'rgba(255,255,255,0.9)', padding: '12px 24px',
          borderRadius: 8, fontSize: 14,
        }}>
          Loading map…
        </div>
      )}

      <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
        />
        {geoData && (
          <GeoJSON
            key="countries"
            data={geoData}
            ref={geoRef}
            style={feature => ({
              fillColor: scoreToColor(feature?.properties?.score ?? null),
              fillOpacity: 0.75,
              color: '#fff',
              weight: 0.8,
            })}
            onEachFeature={(feature, layer) => {
              layer.on('click', () => onCountryClick(feature.properties.code));
              layer.bindTooltip(
                `${feature.properties.name}: ${Number(feature.properties.score).toFixed(1)}`,
                { sticky: true }
              );
            }}
          />
        )}
      </MapContainer>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 24, right: 16, zIndex: 1000,
        background: 'rgba(255,255,255,0.92)', borderRadius: 8,
        padding: '8px 12px', fontSize: 11, boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
      }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Safety Score</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 80, height: 10, borderRadius: 3,
            background: 'linear-gradient(to right, hsl(120,75%,45%), hsl(60,75%,45%), hsl(0,75%,45%))' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: 80 }}>
          <span>Safe</span><span>Danger</span>
        </div>
      </div>
    </div>
  );
}
