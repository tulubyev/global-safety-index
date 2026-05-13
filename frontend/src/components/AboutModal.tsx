'use client';

interface Props {
  onClose: () => void;
}

const SOURCES = [
  {
    name: 'UCDP — Uppsala Conflict Data Program',
    desc: 'Georeferenced conflict events dataset (GED), Uppsala University',
    url:  'https://ucdp.uu.se/',
  },
  {
    name: 'GTD — Global Terrorism Database',
    desc: 'Terrorism incidents worldwide, National Consortium for the Study of Terrorism (START)',
    url:  'https://www.start.umd.edu/gtd/',
  },
  {
    name: 'ACLED — Armed Conflict Location & Event Data',
    desc: 'Real-time data on political violence and protest events globally',
    url:  'https://acleddata.com/',
  },
  {
    name: 'INFORM Risk Index',
    desc: 'UN-backed humanitarian crisis risk index covering 191 countries',
    url:  'https://drmkc.jrc.ec.europa.eu/inform-index/',
  },
  {
    name: 'ReliefWeb Disasters',
    desc: 'Ongoing and recent natural disaster alerts, UN OCHA',
    url:  'https://reliefweb.int/disasters',
  },
  {
    name: 'World Bank — Food Security',
    desc: 'Prevalence of undernourishment and food insecurity indicators',
    url:  'https://data.worldbank.org/topic/agriculture-and-rural-development',
  },
  {
    name: 'USGS — Seismic Hazard',
    desc: 'Global earthquake hazard map and peak ground acceleration data',
    url:  'https://www.usgs.gov/programs/earthquake-hazards',
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
            risk across five dimensions: <strong>armed conflict</strong>, <strong>natural
            disasters</strong>, <strong>food security</strong>, <strong>seismic
            activity</strong>, and <strong>pandemic risk</strong>. Each dimension can be
            weighted according to your own priorities using the sliders on the left panel.
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
            The composite risk score is calculated as a weighted sum of five normalised dimensions.
            Default weights reflect expert consensus but can be adjusted by the user:
          </p>

          {/* Formula block */}
          <div style={{
            background: '#f8fafc', border: '1px solid #e2e8f0',
            borderRadius: 8, padding: '12px 16px', marginBottom: 12,
            fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8, color: '#1e293b',
          }}>
            <div style={{ color: '#64748b', marginBottom: 4, fontFamily: 'sans-serif', fontSize: 11 }}>Score (0–100)</div>
            <div>= <span style={{ color: '#dc2626' }}>w₁</span> × Conflict</div>
            <div>+ <span style={{ color: '#ea580c' }}>w₂</span> × Disaster</div>
            <div>+ <span style={{ color: '#ca8a04' }}>w₃</span> × Food Security</div>
            <div>+ <span style={{ color: '#7c3aed' }}>w₄</span> × Seismic</div>
            <div>+ <span style={{ color: '#0891b2' }}>w₅</span> × Pandemic Risk</div>
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #e2e8f0', color: '#64748b' }}>
              w₁+w₂+w₃+w₄+w₅ = 100%
            </div>
          </div>

          {/* Default weights table */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { icon: '⚔️', label: 'Armed Conflict',   w: '30%', color: '#dc2626', src: 'ACLED, GTD' },
              { icon: '🌪️', label: 'Natural Disaster',  w: '20%', color: '#ea580c', src: 'INFORM, ReliefWeb' },
              { icon: '🌾', label: 'Food Security',     w: '20%', color: '#ca8a04', src: 'World Bank' },
              { icon: '🔴', label: 'Seismic Activity',  w: '10%', color: '#7c3aed', src: 'USGS' },
              { icon: '🦠', label: 'Pandemic Risk',     w: '20%', color: '#0891b2', src: 'WHO, ReliefWeb' },
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
            All dimensions are independently normalised to 0–100 before weighting.
            The formula and weights are open for public discussion — contact us if you
            have suggestions for improving the methodology.
          </p>
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
