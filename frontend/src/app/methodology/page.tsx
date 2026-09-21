'use client';

import { useEffect, useState } from 'react';
import { WEIGHT_DIMS } from '@/types/weights';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Meta {
  formula: string;
  updated: string | null;
  countries: number;
  dimensions: number;
  coverage: Record<string, number>;
  weights: Record<string, number>;
}

/** What each dimension measures, where it comes from, and how it is scaled. */
const DIMS = [
  {
    key: 'conflict',
    measures: 'Deaths from organised violence, per 100,000 people per year',
    source: 'UCDP Georeferenced Event Dataset + monthly candidate events',
    href: 'https://ucdp.uu.se/',
    scale: '0.01 → 0 · 1 → 50 · 100 → 100 (log)',
    note: 'Events since 2020, weighted by a 2-year half-life so recent deaths count for more. A country absent from UCDP recorded no organised violence — a measured zero, not missing data.',
  },
  {
    key: 'crime',
    measures: 'Intentional homicides per 100,000 people per year',
    source: 'UNODC, via World Bank VC.IHR.PSRC.P5',
    href: 'https://dataunodc.un.org/dp-intentional-homicide-victims',
    scale: '0.2 → 0 · 1 → 20 · 6 → 53 · 50 → 100 (log)',
    note: 'Homicide is the only violent-crime statistic collected comparably worldwide. Robbery and assault enter only indirectly, through their correlation with it.',
  },
  {
    key: 'road',
    measures: 'Road traffic deaths per 100,000 people per year',
    source: 'WHO Global Health Observatory, via World Bank SH.STA.TRAF.P5',
    href: 'https://www.who.int/data/gho/data/themes/road-safety',
    scale: '2 → 0 · 10 → 40 · 18 → 60 · 45 → 100',
    note: 'Road crashes kill more travellers than crime and terrorism together. Latest global figures are from 2019.',
  },
  {
    key: 'disaster',
    measures: 'Exposure to floods, cyclones, drought and tsunami',
    source: 'INFORM Risk Index (EU JRC) 70% + ReliefWeb ongoing disasters 30%',
    href: 'https://drmkc.jrc.ec.europa.eu/inform-index/',
    scale: 'INFORM sub-indices ×10; events 0.3 → 0 · 3 → 60 (log)',
    note: 'Earthquakes are deliberately excluded here — they belong to the seismic dimension and would otherwise be counted twice.',
  },
  {
    key: 'food',
    measures: 'Share of the population without reliable access to food',
    source: 'FAO Food Insecurity Experience Scale (SDG 2.1.2); undernourishment where FIES is unpublished',
    href: 'https://data.worldbank.org/indicator/SN.ITK.MSFI.ZS',
    scale: '2% → 0 · 10% → 30 · 25% → 55 · 80% → 100',
    note: 'Undernourishment alone was unusable: FAO censors it at 2.5%, so 63 countries shared one floor value and the measure could not tell Norway from the United States.',
  },
  {
    key: 'seismic',
    measures: 'Earthquake hazard',
    source: 'INFORM earthquake hazard 80% + USGS M4.5+ over 30 days 20%',
    href: 'https://earthquake.usgs.gov/',
    scale: 'INFORM ×10; recent energy log10 6.5 → 0 · 11 → 100',
    note: 'Weighted towards the structural index: seismic hazard is set by tectonics, not by whether anything shook last month.',
  },
  {
    key: 'pandemic',
    measures: 'Epidemic vulnerability and active outbreaks',
    source: 'INFORM epidemic 40% + WHO Disease Outbreak News 35% + ReliefWeb epidemics 25%',
    href: 'https://www.who.int/emergencies/disease-outbreak-news',
    scale: 'INFORM ×10; outbreak sums 0.3 → 0 · 3 → 70 (log)',
    note: 'WHO alerts decay with a 180-day half-life; events declared a public health emergency of international concern count double.',
  },
];

const LIMITS = [
  'Anchor points are an expert calibration. They are chosen to match the meaning of each quantity — FAO severity bands, the observed distribution of homicide rates — but they are a judgement, not a result derived from the data.',
  'UCDP attributes deaths to where the fighting happens. An aggressor state is not scored for a war it wages abroad; that war appears in the data of the country it is fought in.',
  'Food and road figures lag by two to three years, and the WHO road data is from 2019.',
  'Homicide is reported irregularly. For some countries the most recent figure is several years old; for a few there is none.',
  'Travel advisories, healthcare quality and rule of law are not represented.',
  'Non-sovereign territories are excluded from rankings: international indices do not cover them separately, so most of their dimensions are unknown.',
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, color: '#111827', marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  );
}

export default function MethodologyPage() {
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    fetch(`${API}/api/meta`).then(r => r.json()).then(setMeta).catch(() => {});
  }, []);

  const p = { fontSize: 14, lineHeight: 1.75, color: '#374151', margin: '0 0 12px' } as const;

  return (
    <main style={{ maxWidth: 780, margin: '0 auto', padding: '48px 20px 80px' }}>
      <a href="/" style={{ fontSize: 13, color: '#1d4ed8', textDecoration: 'none' }}>← Back to the map</a>

      <h1 style={{ fontSize: 30, fontWeight: 800, color: '#111827', margin: '18px 0 6px', letterSpacing: -0.5 }}>
        Methodology
      </h1>
      <p style={{ fontSize: 15, color: '#6b7280', margin: '0 0 36px' }}>
        How World Safety Index 2026 turns public data into a score, and what that score does not tell you.
      </p>

      <Section title="The score">
        <p style={p}>
          Each country is measured on {DIMS.length} dimensions, each mapped to 0–100. The composite is a
          weighted mean of those, then a square root:
        </p>
        <div style={{
          background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
          padding: '14px 18px', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.9,
          color: '#1e293b', marginBottom: 12,
        }}>
          <div>raw &nbsp; = Σ (weight × dimension) ÷ Σ weight</div>
          <div>score = √(raw ÷ 100) × 100</div>
        </div>
        <p style={p}>
          <strong>0 is the lowest risk, 100 the highest.</strong> The square root spreads out the low
          end, so that calm countries stay distinguishable from one another instead of being crushed
          against zero by a handful of extreme ones.
        </p>
        <p style={p}>
          The weights are yours to set. The defaults below reflect how much each dimension contributes
          to the risk an ordinary person actually faces, but the sliders on the map override them.
        </p>
      </Section>

      <Section title="The scale is absolute">
        <p style={p}>
          Every quantity is mapped to 0–100 through fixed anchor points, not by normalising against the
          other countries in the dataset.
        </p>
        <p style={p}>
          This matters more than it sounds. Under relative scaling, a country&apos;s score moves when some
          other country&apos;s situation changes — if the worst country improves, everyone else looks worse,
          though nothing happened to them. Scores from different dates cannot be compared at all. With
          fixed anchors, 50 means the same thing this year as last.
        </p>
      </Section>

      <Section title="Dimensions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {DIMS.map(d => {
            const dim = WEIGHT_DIMS.find(w => w.key === d.key);
            const covered = meta?.coverage?.[d.key];
            return (
              <div key={d.key} style={{
                border: '1px solid #e5e7eb', borderLeft: `3px solid ${dim?.color ?? '#999'}`,
                borderRadius: 8, padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>
                    {dim?.icon} {dim?.label ?? d.key}
                  </h3>
                  <span style={{ fontSize: 12, fontWeight: 700, color: dim?.color }}>
                    {meta?.weights ? `${Math.round(Number((meta.weights as Record<string, number>)[d.key]) * 100)}%` : ''}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#374151', marginTop: 4 }}>{d.measures}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
                  Source:{' '}
                  <a href={d.href} target="_blank" rel="noopener noreferrer"
                     style={{ color: '#1d4ed8', textDecoration: 'none' }}>{d.source}</a>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3, fontFamily: 'monospace' }}>
                  Anchors: {d.scale}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, lineHeight: 1.6 }}>{d.note}</div>
                {covered !== undefined && (
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                    Data for {covered} countries
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Missing data is not a zero">
        <p style={p}>
          If a source does not cover a country, that dimension is recorded as unknown, not as zero.
          Unknown dimensions are dropped from the formula and the remaining weights rescaled, so a gap
          neither inflates nor deflates the score — it only makes the score rest on less evidence.
        </p>
        <p style={p}>
          Every country panel shows how many sources it stands on. Countries with fewer than three known
          dimensions are kept off the rankings entirely: there is not enough there to compare them fairly.
        </p>
        <p style={p}>
          A measured zero is different and is kept. A country with no recorded conflict deaths genuinely
          scores zero on conflict.
        </p>
      </Section>

      <Section title="What this does not tell you">
        <ul style={{ ...p, paddingLeft: 20, margin: 0 }}>
          {LIMITS.map((l, i) => <li key={i} style={{ marginBottom: 9 }}>{l}</li>)}
        </ul>
      </Section>

      <Section title="Data freshness">
        {meta ? (
          <p style={p}>
            Last recalculated <strong>{meta.updated ? new Date(meta.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</strong>,
            covering <strong>{meta.countries}</strong> countries across {meta.dimensions} dimensions.
            The pipeline runs weekly; the underlying sources update on their own schedules, from
            real-time (USGS) to annual (INFORM, World Bank, FAO).
          </p>
        ) : (
          <p style={{ ...p, color: '#9ca3af' }}>Loading current figures…</p>
        )}
      </Section>

      <Section title="Licence and attribution">
        <p style={p}>
          Conflict data comes from the Uppsala Conflict Data Program under CC BY 4.0. Please cite
          Davies, Pettersson &amp; Öberg, <em>Organized violence 1989–2025</em>, Journal of Peace
          Research, 2026. All other sources are public datasets from the UN, WHO, FAO, the World Bank
          and the EU Joint Research Centre.
        </p>
        <p style={{ ...p, marginBottom: 0 }}>
          The formula and its anchor points are open to discussion — if you think a calibration is
          wrong, say so:{' '}
          <a href="mailto:alt@worldsafetyindex.org" style={{ color: '#1d4ed8', textDecoration: 'none' }}>
            alt@worldsafetyindex.org
          </a>
        </p>
      </Section>
    </main>
  );
}
