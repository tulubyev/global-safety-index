'use client';

import { useEffect, useState } from 'react';
import { useTrends } from '@/hooks/useSafetyScore';
import { Weights, WEIGHT_DIMS } from '@/types/weights';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';

interface Props {
  countryCode: string;
  weights:     Weights;
  onClose:     () => void;
}

interface CountryData {
  name:     string;
  conflict: number;
  disaster: number;
  food:     number;
  seismic:  number;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Horizontal score bar */
function DimBar({ label, icon, color, value, desc }: {
  label: string; icon: string; color: string; value: number; desc: string;
}) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{icon} {label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{pct.toFixed(1)}</span>
      </div>
      <div style={{ background: '#f3f4f6', borderRadius: 4, height: 7, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 4,
          background: `linear-gradient(to right, ${color}88, ${color})`,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{desc}</div>
    </div>
  );
}

/** Overall danger gauge (0-100 arc) */
function ScoreGauge({ score }: { score: number }) {
  const hue  = Math.max(0, 120 - score * 1.2);
  const color = `hsl(${hue}, 75%, 42%)`;
  const label = score < 20 ? 'Very Safe' : score < 40 ? 'Safe' : score < 60 ? 'Moderate' : score < 80 ? 'Dangerous' : 'Very Dangerous';
  return (
    <div style={{ textAlign: 'center', padding: '8px 0 12px' }}>
      <div style={{ fontSize: 36, fontWeight: 800, color, letterSpacing: -1 }}>
        {score.toFixed(1)}
      </div>
      <div style={{
        display: 'inline-block', padding: '2px 10px', borderRadius: 12,
        background: color + '22', color, fontSize: 11, fontWeight: 600,
      }}>
        {label}
      </div>
    </div>
  );
}

export default function CountryPanel({ countryCode, weights, onClose }: Props) {
  const [country, setCountry]   = useState<CountryData | null>(null);
  const [loading, setLoading]   = useState(true);
  const { data: trendsData }    = useTrends(countryCode);

  // Fetch country detail from map API
  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/map?country=${countryCode}`)
      .then(r => r.json())
      .then(d => {
        const p = d.properties;
        setCountry({
          name:     p.name,
          conflict: Number(p.conflict) || 0,
          disaster: Number(p.disaster) || 0,
          food:     Number(p.food)     || 0,
          seismic:  Number(p.seismic)  || 0,
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [countryCode]);

  // Compute weighted score from current sliders
  const weightedScore = (() => {
    if (!country) return 0;
    const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    const w = {
      conflict: weights.conflict / total,
      disaster: weights.disaster / total,
      food:     weights.food     / total,
      seismic:  weights.seismic  / total,
    };
    return (
      w.conflict * country.conflict +
      w.disaster * country.disaster +
      w.food     * country.food     +
      w.seismic  * country.seismic
    );
  })();

  // Build trend chart data
  const chartData = (trendsData?.history || []).map((d: any) => ({
    date:     new Date(d.date).getFullYear(),
    conflict: Number(d.conflict) || 0,
    disaster: Number(d.disaster) || 0,
    food:     Number(d.food)     || 0,
  }));

  return (
    <div style={{
      position: 'absolute', top: 16, right: 16, width: 330,
      background: '#fff', borderRadius: 10,
      boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
      zIndex: 1000, overflow: 'hidden',
      maxHeight: 'calc(100vh - 48px)', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', borderBottom: '1px solid #f3f4f6',
        position: 'sticky', top: 0, background: '#fff', zIndex: 1,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>
            {loading ? countryCode : (country?.name || countryCode)}
          </div>
          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>
            ISO2: {countryCode}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            border: 'none', background: '#f3f4f6', cursor: 'pointer',
            borderRadius: '50%', width: 28, height: 28, fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#374151',
          }}
        >×</button>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        {loading ? (
          <p style={{ fontSize: 12, color: '#9ca3af', padding: '16px 0' }}>Loading…</p>
        ) : (
          <>
            {/* Overall score */}
            <ScoreGauge score={weightedScore} />

            <div style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center', marginTop: -8, marginBottom: 14 }}>
              based on current slider weights
            </div>

            {/* Dimension bars */}
            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
              {WEIGHT_DIMS.map(dim => (
                <DimBar
                  key={dim.key}
                  label={dim.label}
                  icon={dim.icon}
                  color={dim.color}
                  value={country?.[dim.key] ?? 0}
                  desc={dim.desc}
                />
              ))}
            </div>

            {/* Trends chart */}
            {chartData.length > 1 && (
              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12, marginTop: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Historical Trend
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: -20 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                    <Tooltip
                      contentStyle={{ fontSize: 11 }}
                      formatter={(v: any) => Number(v).toFixed(1)}
                    />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="conflict" stroke="#dc2626" dot={false} strokeWidth={1.5} name="Conflict" />
                    <Line type="monotone" dataKey="disaster" stroke="#ea580c" dot={false} strokeWidth={1.5} name="Disaster" />
                    <Line type="monotone" dataKey="food"     stroke="#ca8a04" dot={false} strokeWidth={1.5} name="Food" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
