'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WeightSliders from '@/components/WeightSliders';
import Top10List from '@/components/Top10List';
import CountryPanel from '@/components/CountryPanel';
import AboutModal from '@/components/AboutModal';
import { Weights, DEFAULT_WEIGHTS } from '@/types/weights';

const SafetyMap = dynamic(() => import('@/components/SafetyMap'), { ssr: false });

const queryClient = new QueryClient();

export default function AppContent() {
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <main style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <aside style={{ width: 320, overflowY: 'auto', padding: 16, borderRight: '1px solid #ccc' }}>

          {/* Banner — кликабельный заголовок */}
          <button
            onClick={() => setShowAbout(true)}
            style={{
              display: 'block', width: '100%',
              background: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%)',
              border: 'none', borderRadius: 10, padding: '14px 16px',
              cursor: 'pointer', marginBottom: 16, textAlign: 'left',
              boxShadow: '0 2px 8px rgba(29,78,216,0.3)',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: 0.3 }}>
              🌍 World Safety Index
            </div>
            <div style={{ fontSize: 11, color: '#93c5fd', marginTop: 4, fontWeight: 500 }}>
              Actual Data for Your Security
            </div>
          </button>
          <WeightSliders weights={weights} onChange={setWeights} />
          <Top10List weights={weights} onSelect={setSelectedCountry} />
        </aside>
        <div style={{ flex: 1, position: 'relative' }}>
          <SafetyMap weights={weights} onCountryClick={setSelectedCountry} />
          {selectedCountry && (
            <CountryPanel countryCode={selectedCountry} weights={weights} onClose={() => setSelectedCountry(null)} />
          )}
        </div>
      </main>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </QueryClientProvider>
  );
}
