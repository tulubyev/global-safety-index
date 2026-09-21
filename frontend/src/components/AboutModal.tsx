'use client';

interface Props {
  onClose: () => void;
}

const SOURCES = [
  {
    name: 'UCDP — Uppsala Conflict Data Program (GED)',
    desc: 'Georeferenced fatalities from state-based, non-state and one-sided violence; yearly GED + monthly candidate events, 2-year half-life. CC BY 4.0 — Davies, Pettersson & Öberg, JPR 2026',
    url:  'https://ucdp.uu.se/',
  },
  {
    name: 'INFORM Risk Index',
    desc: 'EU JRC / UN structural hazard index (flood, cyclone, drought, tsunami, earthquake, epidemic) — 191 countries',
    url:  'https://drmkc.jrc.ec.europa.eu/inform-index/',
  },
  {
    name: 'ReliefWeb Disasters',
    desc: 'Ongoing and recent natural disaster alerts, UN OCHA',
    url:  'https://reliefweb.int/disasters',
  },
  {
    name: 'FAO — Food Insecurity (FIES)',
    desc: 'Moderate or severe food insecurity, SDG indicator 2.1.2; undernourishment used where FIES is unpublished',
    url:  'https://data.worldbank.org/indicator/SN.ITK.MSFI.ZS',
  },
  {
    name: 'WHO — Road Traffic Deaths',
    desc: 'Road traffic fatalities per 100,000 people, Global Health Observatory',
    url:  'https://www.who.int/data/gho/data/themes/road-safety',
  },
  {
    name: 'UNODC — Intentional Homicide',
    desc: 'Homicides per 100,000 people, UN Office on Drugs and Crime (via World Bank VC.IHR.PSRC.P5)',
    url:  'https://dataunodc.un.org/dp-intentional-homicide-victims',
  },
  {
    name: 'USGS — Earthquake Feed',
    desc: 'M4.5+ earthquakes over the last 30 days (recent activity component of seismic risk)',
    url:  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson',
  },
  {
    name: 'WHO — Disease Outbreak News',
    desc: 'Official WHO alerts on infectious disease outbreaks worldwide',
    url:  'https://www.who.int/emergencies/disease-outbreak-news',
  },
  {
    name: 'ReliefWeb — Epidemic Events',
    desc: 'Ongoing epidemic disasters with country-level impact data (UN OCHA)',
    url:  'https://reliefweb.int/disasters?type=EP',
  },
];

export default function AboutModal({ onClose }: Props) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12,
          maxWidth: 620, width: '100%', maxHeight: '90vh',
          overflowY: 'auto', padding: 32,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 }}>
              🌍 World Safety Index 2026
            </h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0', textAlign: 'center' }}>
              Actual Data for Your Security
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: 22,
              cursor: 'pointer', color: '#9ca3af', lineHeight: 1, padding: 4,
            }}
          >✕</button>
        </div>

        {/* Mission */}
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Our Mission</h3>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: '#4b5563', margin: 0 }}>
            World Safety Index provides a clear, data-driven picture of stability and security
            across countries and continents. We aggregate data from leading international
            humanitarian, conflict, and disaster monitoring organisations to give you a fast,
            honest assessment of safety conditions around the world.
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: '#4b5563', margin: '10px 0 0' }}>
            Whether you are planning international travel, conducting research, or making
            decisions that depend on regional security — our index lets you quickly evaluate
            risk across seven dimensions: <strong>armed conflict</strong>, <strong>violent
            crime</strong>, <strong>road safety</strong>, <strong>natural disasters</strong>,
            <strong> food security</strong>, <strong>seismic activity</strong>, and
            <strong> pandemic risk</strong>. Each dimension can be weighted according to your
            own priorities using the sliders on the left panel.
          </p>
        </section>

        {/* How it works */}
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 8 }}>How It Works</h3>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: '#4b5563', margin: 0 }}>
            Raw scores from each data source are normalised to a 0–100 scale and combined
            using a weighted formula. A score of <strong>0</strong> indicates minimal risk;
            <strong> 100</strong> represents the highest observed risk level. The colour scale
            on the map transitions from green (safe) through yellow to red (dangerous).
          </p>
        </section>

        {/* Index Formula */}
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
            Index Formula
          </h3>
          <p style={{ fontSize: 12, lineHeight: 1.6, color: '#4b5563', marginBottom: 10 }}>
            The composite risk score is a weighted sum of seven dimensions, each mapped to 0–100
            against fixed real-world anchors rather than relative to the other countries.
            Default weights can be adjusted by the user:
          </p>

          {/* Formula block */}
          <div style={{
            background: '#f8fafc', border: '1px solid #e2e8f0',
            borderRadius: 8, padding: '12px 16px', marginBottom: 12,
            fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8, color: '#1e293b',
          }}>
            <div style={{ color: '#64748b', marginBottom: 4, fontFamily: 'sans-serif', fontSize: 11 }}>Score (0–100)</div>
            <div>= <span style={{ color: '#dc2626' }}>w₁</span> × Conflict</div>
            <div>+ <span style={{ color: '#be123c' }}>w₂</span> × Violent Crime</div>
            <div>+ <span style={{ color: '#c2410c' }}>w₃</span> × Road Safety</div>
            <div>+ <span style={{ color: '#ea580c' }}>w₄</span> × Disaster</div>
            <div>+ <span style={{ color: '#ca8a04' }}>w₅</span> × Food Security</div>
            <div>+ <span style={{ color: '#7c3aed' }}>w₆</span> × Seismic</div>
            <div>+ <span style={{ color: '#0891b2' }}>w₇</span> × Pandemic Risk</div>
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #e2e8f0', color: '#64748b' }}>
              w₁+…+w₇ = 100%, then score = √(sum / 100) × 100
            </div>
          </div>

          {/* Default weights table */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { icon: '⚔️', label: 'Armed Conflict',   w: '20%', color: '#dc2626', src: 'UCDP' },
              { icon: '🔫', label: 'Violent Crime',     w: '18%', color: '#be123c', src: 'UNODC' },
              { icon: '🚗', label: 'Road Safety',       w: '12%', color: '#c2410c', src: 'WHO' },
              { icon: '🌪️', label: 'Natural Disaster',  w: '14%', color: '#ea580c', src: 'INFORM, ReliefWeb' },
              { icon: '🌾', label: 'Food Security',     w: '12%', color: '#ca8a04', src: 'FAO FIES' },
              { icon: '🔴', label: 'Seismic Activity',  w: '9%',  color: '#7c3aed', src: 'INFORM, USGS' },
              { icon: '🦠', label: 'Pandemic Risk',     w: '15%', color: '#0891b2', src: 'INFORM, WHO, ReliefWeb' },
            ].map(d => (
              <div key={d.label} style={{
                background: '#fff', border: `1px solid ${d.color}33`,
                borderLeft: `3px solid ${d.color}`,
                borderRadius: 6, padding: '7px 10px',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
                  {d.icon} {d.label}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{d.src}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: d.color }}>{d.w}</span>
                </div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, lineHeight: 1.5 }}>
            Scores are absolute: a country&apos;s value does not change when other countries
            do, so rankings stay comparable over time. Conflict, crime and road deaths are
            measured per 100,000 people, not as raw counts. Dimensions without data are
            excluded and the remaining weights rescaled — never counted as zero.
          </p>
          <a
            href="/methodology"
            style={{
              display: 'inline-block', marginTop: 8, fontSize: 12,
              fontWeight: 600, color: '#1d4ed8', textDecoration: 'none',
            }}
          >
            Full methodology, sources and limitations →
          </a>
        </section>

        {/* Data Sources */}
        <section style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Data Sources</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {SOURCES.map(s => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block', padding: '10px 14px',
                  background: '#f9fafb', borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  textDecoration: 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                onMouseLeave={e => (e.currentTarget.style.background = '#f9fafb')}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>{s.name}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{s.desc}</div>
              </a>
            ))}
          </div>
        </section>

        {/* Donate */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 20, textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
            This project is independent and non-commercial. If you find it useful, consider supporting its development.
          </p>
          <button
            disabled
            style={{
              background: '#f59e0b', color: '#fff',
              border: 'none', borderRadius: 8,
              padding: '10px 32px', fontSize: 14, fontWeight: 700,
              cursor: 'not-allowed', opacity: 0.6,
            }}
          >
            ❤️ Donate
          </button>
          <p style={{ fontSize: 11, color: '#d1d5db', marginTop: 6 }}>Coming soon</p>
        </div>

        {/* Copyright */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14, marginTop: 20, textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>
            © {new Date().getFullYear()} World Safety Index. Contact:{' '}
            <a href="mailto:alt@worldsafetyindex.org" style={{ color: '#1d4ed8', textDecoration: 'none' }}>
              alt@worldsafetyindex.org
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
