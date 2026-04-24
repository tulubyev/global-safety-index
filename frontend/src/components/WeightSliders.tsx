'use client';

import { Weights, WEIGHT_DIMS } from '@/types/weights';

interface Props {
  weights: Weights;
  onChange: (w: Weights) => void;
}

export default function WeightSliders({ weights, onChange }: Props) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;

  function handleChange(key: keyof Weights, raw: number) {
    onChange({ ...weights, [key]: raw });
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Risk Weights</h2>
        <span style={{ fontSize: 11, color: '#888' }}>drag to adjust</span>
      </div>

      {WEIGHT_DIMS.map(({ key, label, icon, color, desc }) => {
        const pct = Math.round((weights[key] / total) * 100);
        return (
          <div key={key} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                {icon} {label}
              </span>
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                color: weights[key] === 0 ? '#bbb' : color,
                minWidth: 36,
                textAlign: 'right',
              }}>
                {pct}%
              </span>
            </div>

            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={weights[key]}
              onChange={e => handleChange(key, Number(e.target.value))}
              style={{ width: '100%', accentColor: color, cursor: 'pointer' }}
            />

            <div style={{ fontSize: 10, color: '#aaa', marginTop: 1 }}>{desc}</div>
          </div>
        );
      })}

      {Object.values(weights).every(v => v === 0) && (
        <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>⚠️ All weights are zero</p>
      )}
    </div>
  );
}
