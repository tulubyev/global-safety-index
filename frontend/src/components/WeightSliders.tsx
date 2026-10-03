'use client';

import { useState } from 'react';
import { Weights, WEIGHT_DIMS, DEFAULT_WEIGHTS } from '@/types/weights';

interface Props {
  weights: Weights;
  onChange: (w: Weights) => void;
}

const KEYS = WEIGHT_DIMS.map(d => d.key);

/**
 * Native range inputs are 4px tall with a tiny thumb, which is why these were
 * awkward to drag. A taller hit area, a visible filled track and a grab cursor
 * make the control usable; the track gradient shows the value without needing
 * a second element.
 */

const clamp = (n: number) => Math.min(100, Math.max(0, n));

export default function WeightSliders({ weights, onChange }: Props) {
  // Text being typed, before it is committed. Kept separate from the weights so
  // that clearing the box mid-edit does not momentarily mean "zero".
  const [draft, setDraft] = useState<Partial<Record<keyof Weights, string>>>({});

  const total = KEYS.reduce((a, k) => a + (Number(weights[k]) || 0), 0);
  const balanced = total === 100;

  const setWeight = (key: keyof Weights, v: number) =>
    onChange({ ...weights, [key]: clamp(Math.round(v)) });

  function commitDraft(key: keyof Weights) {
    const raw = draft[key];
    // type="number" hands us either '' or a parseable number string — anything
    // else the browser has already rejected, so an unparseable draft means
    // "left blank" and the previous value stands.
    if (raw !== undefined && raw.trim() !== '') {
      const n = Number(raw);
      if (Number.isFinite(n)) setWeight(key, n);
    }
    setDraft(d => {
      const next = { ...d };
      delete next[key];
      return next;
    });
  }

  /**
   * Scale every weight so they sum to exactly 100 while keeping their ratios.
   * Largest-remainder rounding, so the parts are whole numbers and still add up
   * — naive rounding leaves a total of 99 or 101.
   */
  function normalise() {
    if (total <= 0) return onChange({ ...DEFAULT_WEIGHTS });

    const exact = KEYS.map(k => ((Number(weights[k]) || 0) / total) * 100);
    const out   = exact.map(Math.floor);
    const short = 100 - out.reduce((a, b) => a + b, 0);

    const byRemainder = exact
      .map((v, i) => ({ rem: v - Math.floor(v), i }))
      .sort((a, b) => b.rem - a.rem);

    for (let n = 0; n < short; n++) out[byRemainder[n % byRemainder.length].i]++;

    onChange(Object.fromEntries(KEYS.map((k, i) => [k, out[i]])) as unknown as Weights);
  }

  const allZero = total === 0;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Risk Weights</h2>
        <button
          onClick={() => onChange({ ...DEFAULT_WEIGHTS })}
          style={{
            background: 'none', border: 'none', padding: 0,
            fontSize: 11, color: '#6b7280', cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          reset
        </button>
      </div>
      <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 10 }}>
        drag, or type a value and press Enter
      </div>

      {WEIGHT_DIMS.map(({ key, label, icon, color, desc }) => {
        const value = Number(weights[key]) || 0;
        const shown = draft[key] ?? String(value);
        const share = total > 0 ? (value / total) * 100 : 0;

        return (
          <div key={key} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{icon} {label}</span>

              <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <input
                  className="wsi-num"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={shown}
                  aria-label={`${label} weight, percent`}
                  onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                  onBlur={() => commitDraft(key)}
                  onFocus={e => e.currentTarget.select()}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { commitDraft(key); e.currentTarget.blur(); }
                    if (e.key === 'Escape') {
                      setDraft(d => { const n = { ...d }; delete n[key]; return n; });
                      e.currentTarget.blur();
                    }
                  }}
                  style={{
                    width: 38, padding: '2px 4px', textAlign: 'right',
                    fontSize: 12, fontWeight: 700,
                    color: value === 0 ? '#9ca3af' : color,
                    border: '1px solid #e5e7eb', borderRadius: 4,
                    background: '#fff', outlineColor: color,
                  }}
                />
                <span style={{ fontSize: 11, color: '#9ca3af' }}>%</span>
              </span>
            </div>

            <input
              className="wsi-range"
              type="range"
              min={0}
              max={100}
              step={1}
              value={value}
              aria-label={`${label} weight`}
              onChange={e => setWeight(key, Number(e.target.value))}
              style={{
                ['--wsi-color' as string]: color,
                ['--wsi-ring' as string]: `${color}55`,
                ['--wsi-track' as string]:
                  `linear-gradient(to right, ${color} ${value}%, #e5e7eb ${value}%)`,
              } as React.CSSProperties}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 10, color: '#aaa' }}>{desc}</span>
              {!balanced && value > 0 && (
                <span style={{ fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                  = {share.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* The score uses the ratios, so any total works — but a total of 100
          means the numbers above can be read as the percentages they look like. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        marginTop: 12, paddingTop: 8, borderTop: '1px solid #f3f4f6',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: balanced ? '#16a34a' : '#b45309' }}>
          {balanced ? '✓ Total 100%' : `Total ${total}%`}
        </span>
        {!balanced && (
          <button
            onClick={normalise}
            style={{
              fontSize: 11, fontWeight: 600, color: '#fff', background: '#1d4ed8',
              border: 'none', borderRadius: 5, padding: '3px 9px', cursor: 'pointer',
            }}
          >
            scale to 100%
          </button>
        )}
      </div>

      {!balanced && !allZero && (
        <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 5, lineHeight: 1.5 }}>
          Scores use the ratio between weights, so this still works — the shares
          each dimension actually gets are shown above.
        </p>
      )}

      {allZero && (
        <p style={{ fontSize: 11, color: '#dc2626', marginTop: 6 }}>
          ⚠️ All weights are zero — give at least one dimension a value.
        </p>
      )}
    </div>
  );
}
