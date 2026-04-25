'use client';

import { useState } from 'react';
import { useTopN, useBottomN } from '@/hooks/useSafetyScore';
import { Weights } from '@/types/weights';

interface Props {
  weights: Weights;
  onSelect: (code: string) => void;
}

/**
 * Re-normalise scores within the displayed group → 0-100.
 * Used only when global scores don't differentiate the group (many zeros).
 * Returns null if all raw_scores are identical (truly tied).
 */
function localNorm(rows: any[]): Map<string, number> | null {
  const vals  = rows.map(r => parseFloat(r.raw_score));
  const min   = Math.min(...vals);
  const max   = Math.max(...vals);
  const range = max - min;
  if (range < 0.0001) return null; // all tied — no local norm possible
  return new Map(rows.map(r => [
    r.code,
    Math.sqrt((parseFloat(r.raw_score) - min) / range) * 100,
  ]));
}

function RankTable({
  rows, onSelect, color, maxHeight,
}: {
  rows: any[]; onSelect: (c: string) => void;
  color: string; maxHeight: number;
}) {
  // Use global score if it has variation, else fall back to local norm
  const globalScores = rows.map(r => parseFloat(r.score));
  const globalRange  = Math.max(...globalScores) - Math.min(...globalScores);
  const useLocal     = globalRange < 0.1;
  const local        = useLocal ? localNorm(rows) : null;

  return (
    <div style={{ maxHeight, overflowY: 'auto', borderRadius: 4, border: '1px solid #e5e7eb' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }}>
          <tr style={{ borderBottom: '1px solid #d1d5db' }}>
            <th style={{ textAlign: 'left',  padding: '5px 6px', color: '#6b7280', fontWeight: 600 }}>#</th>
            <th style={{ textAlign: 'left',  padding: '5px 6px', color: '#6b7280', fontWeight: 600 }}>Country</th>
            <th style={{ textAlign: 'right', padding: '5px 6px', color: '#6b7280', fontWeight: 600 }}>
              {useLocal && local ? <span>Score <span style={{ fontWeight: 400, fontSize: 10 }}>(relative)</span></span> : 'Score'}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any) => {
            const displayScore = local
              ? (local.get(row.code) ?? 0).toFixed(1)
              : row.score;

            return (
              <tr
                key={row.code}
                onClick={() => onSelect(row.code)}
                style={{ cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '4px 6px', color: '#9ca3af' }}>{row.rank}</td>
                <td style={{ padding: '4px 6px' }}>{row.country}</td>
                <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, color }}>
                  {displayScore}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Top10List({ weights, onSelect }: Props) {
  const [count, setCount] = useState(10);

  const { data: safeData,   isLoading: safeLoading   } = useTopN(weights, count);
  const { data: dangerData, isLoading: dangerLoading } = useBottomN(weights, count);

  const maxHeight = Math.min(count * 22 + 28, 400);

  return (
    <div>
      {/* Count slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 16px' }}>
        <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>Show:</span>
        <input
          type="range" min={5} max={50} step={5} value={count}
          onChange={e => setCount(Number(e.target.value))}
          style={{ flex: 1, accentColor: '#6b7280', cursor: 'pointer' }}
        />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', minWidth: 36, textAlign: 'right' }}>
          {count}
        </span>
      </div>

      {/* Safest */}
      <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#16a34a' }}>
        🟢 Top {count} Safest
      </h2>
      {safeLoading
        ? <p style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</p>
        : <RankTable rows={safeData?.data ?? []} onSelect={onSelect} color="#16a34a" maxHeight={maxHeight} />
      }

      {/* Most Dangerous */}
      <h2 style={{ fontSize: 13, fontWeight: 600, margin: '18px 0 6px', color: '#dc2626' }}>
        🔴 Top {count} Most Dangerous
      </h2>
      {dangerLoading
        ? <p style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</p>
        : <RankTable rows={dangerData?.data ?? []} onSelect={onSelect} color="#dc2626" maxHeight={maxHeight} />
      }
    </div>
  );
}
