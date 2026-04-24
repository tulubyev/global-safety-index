import type { Metadata } from 'next';
import 'leaflet/dist/leaflet.css';

export const metadata: Metadata = {
  title: 'Global Safety Index',
  description: 'Find the safest places on Earth',
  icons: { icon: '/icon' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'sans-serif' }}>{children}</body>
    </html>
  );
}
