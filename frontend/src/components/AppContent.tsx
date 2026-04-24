'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WeightSliders from '@/components/WeightSliders';
import Top10List from '@/components/Top10List';
import CountryPanel from '@/components/CountryPanel';
import { Weights, DEFAULT_WEIGHTS } from '@/types/weights';

const SafetyMap = dynamic(() => import('@/components/SafetyMap'), { ssr: false });

const queryClient = new QueryClient();

export default function AppContent() {
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  return (
    <QueryClientProvider client={queryClient}>
      <main style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <aside style={{ width: 320, overflowY: 'auto', padding: 16, borderRight: '1px solid #ccc' }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Global Safety Index</h1>
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
    </QueryClientProvider>
  );
}
