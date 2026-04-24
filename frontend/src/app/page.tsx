import dynamic from 'next/dynamic';

const AppContent = dynamic(() => import('@/components/AppContent'), { ssr: false });

export default function Home() {
  return <AppContent />;
}
